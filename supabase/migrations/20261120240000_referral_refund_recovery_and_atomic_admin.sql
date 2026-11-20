-- Atomic admin controls and safe recovery of rewards after full payment refunds.
alter table public.referral_wallets
  add column if not exists recovery_balance numeric(12,2) not null default 0
  check (recovery_balance >= 0);

alter table public.referral_wallet_transactions
  drop constraint if exists referral_wallet_transactions_transaction_type_check;
alter table public.referral_wallet_transactions
  add constraint referral_wallet_transactions_transaction_type_check
  check (transaction_type in (
    'reward_pending','reward_available','withdrawal_reserved',
    'withdrawal_paid','withdrawal_released','reward_reversed',
    'admin_adjustment','recovery_applied'
  ));

create or replace function public.set_referral_withdrawal_block(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_blocked boolean,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.referral_profiles%rowtype;
  v_reason text := left(trim(coalesce(p_reason, '')), 500);
begin
  if p_actor_user_id is null or p_target_user_id is null or p_blocked is null then
    raise exception 'Withdrawal control request is incomplete.';
  end if;
  if not exists (
    select 1 from public.user_roles
    where user_id = p_actor_user_id and role = 'admin'
  ) then
    raise exception 'Only platform administrators can change withdrawal access.';
  end if;
  if p_blocked and length(v_reason) < 5 then
    raise exception 'Enter a clear reason of at least 5 characters before blocking withdrawals.';
  end if;

  select * into v_profile from public.referral_profiles
  where user_id = p_target_user_id for update;
  if not found then raise exception 'Referral customer account was not found.'; end if;

  update public.referral_profiles
  set withdrawals_blocked = p_blocked,
      withdrawals_block_reason = case when p_blocked then v_reason else null end,
      withdrawals_blocked_at = case when p_blocked then now() else null end,
      withdrawals_blocked_by = case when p_blocked then p_actor_user_id else null end
  where user_id = p_target_user_id;

  insert into public.referral_admin_audit(actor_user_id, target_user_id, action, reason)
  values (
    p_actor_user_id, p_target_user_id,
    case when p_blocked then 'withdrawals_blocked' else 'withdrawals_unblocked' end,
    case when p_blocked then v_reason else null end
  );

  return jsonb_build_object('updated', true, 'blocked', p_blocked);
end;
$$;
revoke all on function public.set_referral_withdrawal_block(uuid,uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.set_referral_withdrawal_block(uuid,uuid,boolean,text) to service_role;

-- A full refund removes an unspent referral reward. If it has already been
-- withdrawn, the outstanding amount becomes a recovery balance and withdrawals
-- remain blocked until future rewards repay it.
create or replace function public.reverse_referral_reward(
  p_payment_reference text,
  p_refund_amount_kobo bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_reward public.referral_rewards%rowtype;
  v_wallet public.referral_wallets%rowtype;
  v_deduct numeric(12,2);
  v_recovery numeric(12,2);
begin
  if p_payment_reference is null or p_refund_amount_kobo is null or p_refund_amount_kobo <= 0 then
    raise exception 'Refund details are invalid.';
  end if;

  select * into v_payment from public.payments
  where reference = p_payment_reference for update;
  if not found then return jsonb_build_object('reversed', false, 'reason', 'payment_not_found'); end if;
  if p_refund_amount_kobo < round(v_payment.amount * 100)::bigint then
    return jsonb_build_object('reversed', false, 'reason', 'partial_refund');
  end if;

  select * into v_reward from public.referral_rewards
  where payment_id = v_payment.id for update;
  if not found then return jsonb_build_object('reversed', false, 'reason', 'no_referral_reward'); end if;
  if v_reward.status = 'reversed' then
    return jsonb_build_object('reversed', false, 'reason', 'already_reversed');
  end if;

  select * into v_wallet from public.referral_wallets
  where user_id = v_reward.referrer_user_id for update;
  if not found then raise exception 'Referral wallet not found.'; end if;

  v_deduct := least(v_wallet.available_balance, v_reward.amount);
  v_recovery := v_reward.amount - v_deduct;

  update public.referral_wallets
  set available_balance = available_balance - v_deduct,
      recovery_balance = recovery_balance + v_recovery
  where user_id = v_reward.referrer_user_id;

  update public.referral_rewards
  set status = 'reversed', reversed_at = now()
  where id = v_reward.id;

  insert into public.referral_wallet_transactions
    (user_id, transaction_type, amount, status, reference_type, reference_id, idempotency_key, description)
  values
    (v_reward.referrer_user_id, 'reward_reversed', v_reward.amount, 'posted',
     'referral_reward', v_reward.id, 'referral-refund-reversed:' || v_reward.id::text,
     'Referral reward reversed after the referred payment was fully refunded');

  if v_recovery > 0 then
    update public.referral_profiles
    set withdrawals_blocked = true,
        withdrawals_block_reason = 'A referred payment was refunded after its reward had been used. Future referral earnings will repay the outstanding balance before withdrawals are re-enabled.',
        withdrawals_blocked_at = now(),
        withdrawals_blocked_by = null
    where user_id = v_reward.referrer_user_id;
  end if;

  return jsonb_build_object('reversed', true, 'deducted', v_deduct, 'recovery_balance_added', v_recovery);
end;
$$;
revoke all on function public.reverse_referral_reward(text,bigint) from public, anon, authenticated;
grant execute on function public.reverse_referral_reward(text,bigint) to service_role;

-- New rewards first repay any outstanding refund recovery amount.
create or replace function public.credit_referral_reward(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_referrer uuid;
  v_reward_id uuid;
  v_recovery_applied numeric(12,2);
  v_net_credit numeric(12,2);
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then return jsonb_build_object('credited', false, 'reason', 'payment_not_found'); end if;
  if v_payment.status <> 'success' or v_payment.currency <> 'NGN' or v_payment.amount <> 2500 then
    return jsonb_build_object('credited', false, 'reason', 'payment_not_eligible');
  end if;

  select a.referrer_user_id into v_referrer
  from public.referral_attributions a
  where a.referred_user_id = v_payment.user_id;
  if v_referrer is null or v_referrer = v_payment.user_id then
    return jsonb_build_object('credited', false, 'reason', 'no_valid_referrer');
  end if;

  insert into public.referral_rewards
    (payment_id, referrer_user_id, referred_user_id, amount, status, available_at)
  values (v_payment.id, v_referrer, v_payment.user_id, 500, 'available', now())
  on conflict (payment_id) do nothing
  returning id into v_reward_id;
  if v_reward_id is null then return jsonb_build_object('credited', false, 'reason', 'already_credited'); end if;

  insert into public.referral_wallets(user_id)
  values (v_referrer) on conflict (user_id) do nothing;

  select recovery_balance into v_recovery_applied
  from public.referral_wallets where user_id = v_referrer for update;
  v_recovery_applied := least(coalesce(v_recovery_applied, 0), 500);
  v_net_credit := 500 - v_recovery_applied;

  update public.referral_wallets
  set recovery_balance = recovery_balance - v_recovery_applied,
      available_balance = available_balance + v_net_credit,
      lifetime_earned = lifetime_earned + 500
  where user_id = v_referrer;

  if v_net_credit > 0 then
    insert into public.referral_wallet_transactions
      (user_id, transaction_type, amount, status, reference_type, reference_id, idempotency_key, description)
    values (v_referrer, 'reward_available', v_net_credit, 'posted', 'referral_reward', v_reward_id,
      'referral-reward:' || v_payment.id::text, 'Net referral reward credited after recovery offset');
  end if;
  if v_recovery_applied > 0 then
    insert into public.referral_wallet_transactions
      (user_id, transaction_type, amount, status, reference_type, reference_id, idempotency_key, description)
    values (v_referrer, 'recovery_applied', v_recovery_applied, 'posted', 'referral_reward', v_reward_id,
      'referral-recovery-applied:' || v_payment.id::text, 'New referral reward applied to outstanding refund recovery');
  end if;

  if (select recovery_balance from public.referral_wallets where user_id = v_referrer) = 0 then
    update public.referral_profiles
    set withdrawals_blocked = false, withdrawals_block_reason = null,
        withdrawals_blocked_at = null, withdrawals_blocked_by = null
    where user_id = v_referrer
      and withdrawals_block_reason like 'A referred payment was refunded%';
  end if;

  return jsonb_build_object('credited', true, 'reward_id', v_reward_id,
    'amount', 500, 'available_credit', v_net_credit, 'recovery_applied', v_recovery_applied);
end;
$$;
revoke all on function public.credit_referral_reward(uuid) from public, anon, authenticated;
grant execute on function public.credit_referral_reward(uuid) to service_role;
