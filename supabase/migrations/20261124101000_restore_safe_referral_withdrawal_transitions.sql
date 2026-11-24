-- Serialize withdrawal outcomes and reject stale/conflicting Paystack events.
-- The row lock makes the wallet and ledger changes part of one terminal transition.
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
  if p_reference is null or p_outcome is null
     or p_outcome not in ('success', 'failed', 'reversed') then
    raise exception 'Unsupported transfer outcome.';
  end if;

  select * into v_withdrawal
  from public.referral_withdrawals
  where reference = p_reference
  for update;

  if not found then
    return jsonb_build_object('updated', false, 'reason', 'withdrawal_not_found');
  end if;

  if v_withdrawal.status = p_outcome then
    return jsonb_build_object('updated', false, 'reason', 'already_processed', 'status', v_withdrawal.status);
  end if;

  if v_withdrawal.status in ('failed', 'reversed') then
    return jsonb_build_object('updated', false, 'reason', 'terminal_status', 'status', v_withdrawal.status);
  end if;

  if v_withdrawal.status = 'success' and p_outcome <> 'reversed' then
    return jsonb_build_object('updated', false, 'reason', 'invalid_status_transition', 'status', v_withdrawal.status);
  end if;

  if v_withdrawal.status not in ('queued', 'otp', 'processing', 'success') then
    return jsonb_build_object('updated', false, 'reason', 'invalid_status_transition', 'status', v_withdrawal.status);
  end if;

  if p_outcome = 'success' then
    update public.referral_withdrawals
    set status = 'success',
        paystack_transfer_code = coalesce(p_transfer_code, paystack_transfer_code),
        completed_at = now(),
        failure_reason = null
    where id = v_withdrawal.id;

    update public.referral_wallets
    set lifetime_paid = lifetime_paid + v_withdrawal.amount
    where user_id = v_withdrawal.user_id;
    if not found then raise exception 'Referral wallet not found.'; end if;

    insert into public.referral_wallet_transactions
      (user_id, transaction_type, amount, status, reference_type, reference_id, idempotency_key, description)
    values
      (v_withdrawal.user_id, 'withdrawal_paid', v_withdrawal.amount, 'posted',
       'referral_withdrawal', v_withdrawal.id,
       'withdrawal-paid:' || v_withdrawal.id::text, 'Referral withdrawal paid')
    on conflict (idempotency_key) do nothing;
  elsif p_outcome = 'failed' then
    update public.referral_withdrawals
    set status = 'failed',
        failure_reason = left(coalesce(p_failure_reason, 'Transfer failed'), 500),
        paystack_transfer_code = coalesce(p_transfer_code, paystack_transfer_code),
        completed_at = now()
    where id = v_withdrawal.id;

    update public.referral_wallets
    set available_balance = available_balance + v_withdrawal.amount
    where user_id = v_withdrawal.user_id;
    if not found then raise exception 'Referral wallet not found.'; end if;

    insert into public.referral_wallet_transactions
      (user_id, transaction_type, amount, status, reference_type, reference_id, idempotency_key, description)
    values
      (v_withdrawal.user_id, 'withdrawal_released', v_withdrawal.amount, 'posted',
       'referral_withdrawal', v_withdrawal.id,
       'withdrawal-released:' || v_withdrawal.id::text,
       'Failed transfer released back to available balance')
    on conflict (idempotency_key) do nothing;
  else
    update public.referral_withdrawals
    set status = 'reversed',
        failure_reason = left(coalesce(p_failure_reason, 'Transfer reversed'), 500),
        paystack_transfer_code = coalesce(p_transfer_code, paystack_transfer_code),
        completed_at = now()
    where id = v_withdrawal.id;

    if v_withdrawal.status = 'success' then
      update public.referral_wallets
      set available_balance = available_balance + v_withdrawal.amount,
          lifetime_paid = greatest(0, lifetime_paid - v_withdrawal.amount)
      where user_id = v_withdrawal.user_id;
    else
      update public.referral_wallets
      set available_balance = available_balance + v_withdrawal.amount
      where user_id = v_withdrawal.user_id;
    end if;
    if not found then raise exception 'Referral wallet not found.'; end if;

    insert into public.referral_wallet_transactions
      (user_id, transaction_type, amount, status, reference_type, reference_id, idempotency_key, description)
    values
      (v_withdrawal.user_id, 'withdrawal_released', v_withdrawal.amount, 'posted',
       'referral_withdrawal', v_withdrawal.id,
       'withdrawal-reversed:' || v_withdrawal.id::text,
       'Reversed transfer returned to available balance')
    on conflict (idempotency_key) do nothing;
  end if;

  return jsonb_build_object('updated', true, 'status', p_outcome);
end;
$$;

revoke all on function public.settle_referral_withdrawal(text, text, text, text) from public, anon, authenticated;
grant execute on function public.settle_referral_withdrawal(text, text, text, text) to service_role;
