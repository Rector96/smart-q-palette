-- Secure referral withdrawal reservations and Paystack transfer reconciliation.
-- This migration is committed to the feature branch only; it is not applied to production.

create or replace function public.reserve_referral_withdrawal(
  p_user_id uuid,
  p_bank_account_id uuid,
  p_amount numeric,
  p_reference text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.referral_wallets%rowtype;
  v_bank public.referral_bank_accounts%rowtype;
  v_withdrawal_id uuid;
begin
  if p_amount is null or p_amount < 1000 or p_amount <> trunc(p_amount) then
    raise exception 'Minimum withdrawal is ₦1,000 and amount must be a whole naira value.';
  end if;
  if p_reference is null or length(p_reference) < 12 or length(p_reference) > 100 then
    raise exception 'Invalid withdrawal reference.';
  end if;

  select * into v_bank
  from public.referral_bank_accounts
  where id = p_bank_account_id and user_id = p_user_id and is_verified = true;
  if not found then raise exception 'Verified bank account not found.'; end if;

  select * into v_wallet
  from public.referral_wallets
  where user_id = p_user_id
  for update;
  if not found then raise exception 'Referral wallet not found.'; end if;
  if v_wallet.available_balance < p_amount then
    raise exception 'Insufficient available referral balance.';
  end if;

  update public.referral_wallets
  set available_balance = available_balance - p_amount
  where user_id = p_user_id;

  insert into public.referral_withdrawals(user_id, bank_account_id, amount, status, reference)
  values (p_user_id, p_bank_account_id, p_amount, 'queued', p_reference)
  returning id into v_withdrawal_id;

  insert into public.referral_wallet_transactions
    (user_id, transaction_type, amount, status, reference_type, reference_id, idempotency_key, description)
  values
    (p_user_id, 'withdrawal_reserved', p_amount, 'posted', 'referral_withdrawal',
     v_withdrawal_id, 'withdrawal-reserved:' || v_withdrawal_id::text,
     'Referral withdrawal reserved for processing');

  return jsonb_build_object('withdrawal_id', v_withdrawal_id, 'reference', p_reference, 'amount', p_amount);
end;
$$;

create or replace function public.settle_referral_withdrawal(
  p_reference text,
  p_outcome text,
  p_transfer_code text default null,
  p_failure_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_withdrawal public.referral_withdrawals%rowtype;
begin
  if p_outcome not in ('success','failed','reversed') then
    raise exception 'Unsupported transfer outcome.';
  end if;

  select * into v_withdrawal
  from public.referral_withdrawals
  where reference = p_reference
  for update;
  if not found then return jsonb_build_object('updated', false, 'reason', 'withdrawal_not_found'); end if;

  if v_withdrawal.status = p_outcome then
    return jsonb_build_object('updated', false, 'reason', 'already_processed');
  end if;
  if v_withdrawal.status in ('failed','reversed') then
    return jsonb_build_object('updated', false, 'reason', 'terminal_status');
  end if;

  if p_outcome = 'success' then
    update public.referral_withdrawals
      set status = 'success', paystack_transfer_code = coalesce(p_transfer_code, paystack_transfer_code),
          completed_at = now(), failure_reason = null
      where id = v_withdrawal.id;
    update public.referral_wallets
      set lifetime_paid = lifetime_paid + v_withdrawal.amount
      where user_id = v_withdrawal.user_id;
    insert into public.referral_wallet_transactions
      (user_id, transaction_type, amount, status, reference_type, reference_id, idempotency_key, description)
    values
      (v_withdrawal.user_id, 'withdrawal_paid', v_withdrawal.amount, 'posted',
       'referral_withdrawal', v_withdrawal.id,
       'withdrawal-paid:' || v_withdrawal.id::text, 'Referral withdrawal paid');
  elsif p_outcome = 'failed' then
    update public.referral_withdrawals
      set status = 'failed', failure_reason = left(coalesce(p_failure_reason, 'Transfer failed'), 500),
          paystack_transfer_code = coalesce(p_transfer_code, paystack_transfer_code), completed_at = now()
      where id = v_withdrawal.id;
    update public.referral_wallets
      set available_balance = available_balance + v_withdrawal.amount
      where user_id = v_withdrawal.user_id;
    insert into public.referral_wallet_transactions
      (user_id, transaction_type, amount, status, reference_type, reference_id, idempotency_key, description)
    values
      (v_withdrawal.user_id, 'withdrawal_released', v_withdrawal.amount, 'posted',
       'referral_withdrawal', v_withdrawal.id,
       'withdrawal-released:' || v_withdrawal.id::text, 'Failed transfer released back to available balance');
  else
    -- A reversal is a returned payout: restore the user's available balance.
    update public.referral_withdrawals
      set status = 'reversed', failure_reason = left(coalesce(p_failure_reason, 'Transfer reversed'), 500),
          paystack_transfer_code = coalesce(p_transfer_code, paystack_transfer_code), completed_at = now()
      where id = v_withdrawal.id;
    update public.referral_wallets
      set available_balance = available_balance + v_withdrawal.amount,
          lifetime_paid = greatest(0, lifetime_paid - v_withdrawal.amount)
      where user_id = v_withdrawal.user_id;
    insert into public.referral_wallet_transactions
      (user_id, transaction_type, amount, status, reference_type, reference_id, idempotency_key, description)
    values
      (v_withdrawal.user_id, 'withdrawal_released', v_withdrawal.amount, 'posted',
       'referral_withdrawal', v_withdrawal.id,
       'withdrawal-reversed:' || v_withdrawal.id::text, 'Reversed transfer returned to available balance');
  end if;

  return jsonb_build_object('updated', true, 'status', p_outcome);
end;
$$;

revoke all on function public.reserve_referral_withdrawal(uuid,uuid,numeric,text) from public, anon, authenticated;
revoke all on function public.settle_referral_withdrawal(text,text,text,text) from public, anon, authenticated;
grant execute on function public.reserve_referral_withdrawal(uuid,uuid,numeric,text) to service_role;
grant execute on function public.settle_referral_withdrawal(text,text,text,text) to service_role;
