-- Reapply the recovery-aware withdrawal settlement after the payment/referral hardening migration.
-- The earlier 20261124101000 version predates refund recovery and would otherwise
-- be overwritten by 20261124193000_harden_paystack_referral_flows.sql.

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
  v_profile public.referral_profiles%rowtype;
  v_wallet public.referral_wallets%rowtype;
  v_recovery_applied numeric(12,2);
  v_available_release numeric(12,2);
begin
  if p_reference is null or p_outcome is null
     or p_outcome not in ('success','failed','reversed') then
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
    return jsonb_build_object('updated', false, 'reason', 'already_processed');
  end if;

  if v_withdrawal.status in ('failed','reversed') then
    return jsonb_build_object('updated', false, 'reason', 'terminal_status');
  end if;

  if v_withdrawal.status = 'success' and p_outcome <> 'reversed' then
    return jsonb_build_object('updated', false, 'reason', 'invalid_status_transition');
  end if;

  if v_withdrawal.status not in ('queued','otp','processing','success') then
    return jsonb_build_object('updated', false, 'reason', 'invalid_status_transition');
  end if;

  if p_outcome = 'success' then
    select * into v_wallet
    from public.referral_wallets
    where user_id = v_withdrawal.user_id
    for update;
    if not found then
      raise exception 'Referral wallet not found.';
    end if;

    update public.referral_withdrawals
    set status = 'success',
        paystack_transfer_code = coalesce(p_transfer_code, paystack_transfer_code),
        completed_at = now(),
        failure_reason = null
    where id = v_withdrawal.id;

    update public.referral_wallets
    set lifetime_paid = lifetime_paid + v_withdrawal.amount
    where user_id = v_withdrawal.user_id;
    if not found then
      raise exception 'Referral wallet could not be updated.';
    end if;

    insert into public.referral_wallet_transactions
      (user_id, transaction_type, amount, status, reference_type, reference_id, idempotency_key, description)
    values
      (v_withdrawal.user_id, 'withdrawal_paid', v_withdrawal.amount, 'posted',
       'referral_withdrawal', v_withdrawal.id,
       'withdrawal-paid:' || v_withdrawal.id::text, 'Referral withdrawal paid')
    on conflict (idempotency_key) do nothing;

    return jsonb_build_object('updated', true, 'status', p_outcome);
  end if;

  select * into v_profile
  from public.referral_profiles
  where user_id = v_withdrawal.user_id
  for update;
  if not found then
    raise exception 'Referral profile not found.';
  end if;

  select * into v_wallet
  from public.referral_wallets
  where user_id = v_withdrawal.user_id
  for update;
  if not found then
    raise exception 'Referral wallet not found.';
  end if;

  v_recovery_applied := least(v_wallet.recovery_balance, v_withdrawal.amount);
  v_available_release := v_withdrawal.amount - v_recovery_applied;

  if p_outcome = 'failed' then
    update public.referral_withdrawals
    set status = 'failed',
        failure_reason = left(coalesce(p_failure_reason, 'Transfer failed'), 500),
        paystack_transfer_code = coalesce(p_transfer_code, paystack_transfer_code),
        completed_at = now()
    where id = v_withdrawal.id;
  else
    update public.referral_withdrawals
    set status = 'reversed',
        failure_reason = left(coalesce(p_failure_reason, 'Transfer reversed'), 500),
        paystack_transfer_code = coalesce(p_transfer_code, paystack_transfer_code),
        completed_at = now()
    where id = v_withdrawal.id;
  end if;
  if not found then
    raise exception 'Referral withdrawal could not be settled.';
  end if;

  update public.referral_wallets
  set available_balance = available_balance + v_available_release,
      recovery_balance = recovery_balance - v_recovery_applied,
      lifetime_paid = case
        when p_outcome = 'reversed' and v_withdrawal.status = 'success'
          then greatest(0, lifetime_paid - v_withdrawal.amount)
        else lifetime_paid
      end
  where user_id = v_withdrawal.user_id;
  if not found then
    raise exception 'Referral wallet could not be updated.';
  end if;

  if v_available_release > 0 then
    insert into public.referral_wallet_transactions
      (user_id, transaction_type, amount, status, reference_type, reference_id, idempotency_key, description)
    values
      (v_withdrawal.user_id, 'withdrawal_released', v_available_release, 'posted',
       'referral_withdrawal', v_withdrawal.id,
       case when p_outcome = 'failed'
         then 'withdrawal-released:' || v_withdrawal.id::text
         else 'withdrawal-reversed:' || v_withdrawal.id::text
       end,
       case when p_outcome = 'failed'
         then 'Failed transfer released after refund recovery'
         else 'Reversed transfer returned after refund recovery'
       end)
    on conflict (idempotency_key) do nothing;
  end if;

  if v_recovery_applied > 0 then
    insert into public.referral_wallet_transactions
      (user_id, transaction_type, amount, status, reference_type, reference_id, idempotency_key, description)
    values
      (v_withdrawal.user_id, 'recovery_applied', v_recovery_applied, 'posted',
       'referral_withdrawal', v_withdrawal.id,
       'withdrawal-recovery-applied:' || v_withdrawal.id::text,
       'Returned withdrawal funds applied to refund recovery')
    on conflict (idempotency_key) do nothing;
  end if;

  if v_wallet.recovery_balance = v_recovery_applied then
    update public.referral_profiles
    set withdrawals_blocked = false,
        withdrawals_block_reason = null,
        withdrawals_blocked_at = null,
        withdrawals_blocked_by = null,
        withdrawals_block_source = null
    where user_id = v_withdrawal.user_id
      and withdrawals_block_source = 'refund_recovery';
  end if;

  return jsonb_build_object(
    'updated', true,
    'status', p_outcome,
    'recovery_applied', v_recovery_applied,
    'available_released', v_available_release
  );
end;
$$;

revoke all on function public.settle_referral_withdrawal(text,text,text,text) from public, anon, authenticated;
grant execute on function public.settle_referral_withdrawal(text,text,text,text) to service_role;
