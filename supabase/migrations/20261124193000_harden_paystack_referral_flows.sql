create table if not exists public.paystack_refund_events (
  paystack_refund_id text primary key check (length(paystack_refund_id) between 1 and 100),
  payment_id uuid not null references public.payments(id) on delete restrict,
  amount_kobo bigint not null check (amount_kobo > 0),
  recorded_at timestamptz not null default now()
);

create index if not exists paystack_refund_events_payment_idx
  on public.paystack_refund_events(payment_id);

alter table public.paystack_refund_events enable row level security;
revoke all on public.paystack_refund_events from public, anon, authenticated, service_role;
comment on table public.paystack_refund_events is
  'Access refund events only through the service-only SECURITY DEFINER refund RPC; direct table privileges are revoked.';

alter table public.payments
  add column if not exists refunded_amount_kobo bigint not null default 0;

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.payments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.payments drop constraint %I', v_constraint.conname);
  end loop;
end;
$$;

alter table public.payments
  add constraint payments_status_check
  check (status in ('pending','success','failed','refunded'));

alter table public.payments
  add constraint payments_refunded_amount_kobo_check
  check (
    refunded_amount_kobo >= 0
    and refunded_amount_kobo <= round(amount * 100)::bigint
  );

alter table public.profiles
  add column if not exists subscription_admin_override boolean;

alter table public.profiles
  alter column subscription_admin_override drop default,
  alter column subscription_admin_override drop not null;

update public.profiles p
set subscription_admin_override = coalesce(
  (
    select coalesce(
      a.details ->> 'new_admin_override',
      a.details ->> 'new_value',
      a.details ->> 'is_subscribed'
    ) = 'true'
    from public.admin_audit_logs a
    where a.target_user_id = p.user_id
      and a.actor_user_id is not null
      and a.action = 'user.subscription_changed'
    order by a.created_at desc, a.id desc
    limit 1
  ),
  case
    when p.is_subscribed and not exists (
      select 1
      from public.payments payment
      where payment.user_id = p.user_id
        and payment.status = 'success'
        and payment.currency = 'NGN'
        and payment.verified_at is not null
        and (
          (payment.payment_method = 'paystack' and payment.plan_id = 'lifetime_access')
          or payment.payment_method = 'manual_bank_transfer'
        )
    ) then true
    else null
  end
);

grant update (subscription_admin_override) on public.profiles to authenticated;

create or replace function public.admin_set_user_subscription(
  _target_user_id uuid,
  _is_subscribed boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not private.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if _target_user_id is null or _is_subscribed is null then
    raise exception 'A target user and subscription state are required' using errcode = '22004';
  end if;

  update public.profiles
  set is_subscribed = _is_subscribed,
      subscription_admin_override = _is_subscribed
  where user_id = _target_user_id;
  if not found then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_set_user_subscription(uuid, boolean) from public, anon;
grant execute on function public.admin_set_user_subscription(uuid, boolean) to authenticated;

create or replace function private.guard_profile_privileged_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.is_subscribed is distinct from old.is_subscribed
      or new.subscription_admin_override is distinct from old.subscription_admin_override
      or new.trial_count is distinct from old.trial_count) then
    if auth.uid() is null then
      if current_user not in ('service_role', 'postgres') then
        raise exception 'Only an administrator or trusted server may change subscription and trial fields'
          using errcode = '42501';
      end if;
    elsif not (
      private.has_role(auth.uid(), 'admin'::public.app_role)
      or private.has_role(auth.uid(), 'moderator'::public.app_role)
    ) then
      raise exception 'Administrator or customer-care access required to change subscription and trial fields'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_profile_privileged_fields() from public, anon, authenticated;

drop trigger if exists profiles_guard_privileged_fields on public.profiles;
create trigger profiles_guard_privileged_fields
  before update of is_subscribed, subscription_admin_override, trial_count on public.profiles
  for each row execute function private.guard_profile_privileged_fields();

create or replace function private.audit_profile_privileged_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  source_label text := case when auth.uid() is null then 'system' else 'admin' end;
begin
  if new.is_subscribed is distinct from old.is_subscribed
     or new.subscription_admin_override is distinct from old.subscription_admin_override then
    insert into public.admin_audit_logs (actor_user_id, action, target_user_id, details)
    values (
      actor,
      'user.subscription_changed',
      new.user_id,
      jsonb_build_object(
        'old_value', old.is_subscribed,
        'new_value', new.is_subscribed,
        'old_admin_override', old.subscription_admin_override,
        'new_admin_override', new.subscription_admin_override,
        'source', source_label
      )
    );
  end if;

  if new.trial_count is distinct from old.trial_count then
    insert into public.admin_audit_logs (actor_user_id, action, target_user_id, details)
    values (
      actor,
      'user.trials_reset',
      new.user_id,
      jsonb_build_object(
        'old_value', old.trial_count,
        'new_value', new.trial_count,
        'source', source_label
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function private.audit_profile_privileged_changes() from public, anon, authenticated;

drop trigger if exists profiles_audit_privileged_changes on public.profiles;
create trigger profiles_audit_privileged_changes
  after update of is_subscribed, subscription_admin_override, trial_count on public.profiles
  for each row execute function private.audit_profile_privileged_changes();

create or replace function private.reconcile_subscription_access(
  p_user_id uuid,
  p_clear_admin_denial boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_override boolean;
  v_has_paid_access boolean;
begin
  select subscription_admin_override
  into v_admin_override
  from public.profiles
  where user_id = p_user_id
  for update;
  if not found then
    raise exception 'User profile not found while reconciling subscription access.';
  end if;

  if p_clear_admin_denial and v_admin_override is false then
    update public.profiles
    set subscription_admin_override = null
    where user_id = p_user_id;
    v_admin_override := null;
  end if;

  select exists (
    select 1
    from public.payments payment
    where payment.user_id = p_user_id
      and payment.status = 'success'
      and payment.currency = 'NGN'
      and payment.verified_at is not null
      and (
        (payment.payment_method = 'paystack' and payment.plan_id = 'lifetime_access')
        or payment.payment_method = 'manual_bank_transfer'
      )
  )
  into v_has_paid_access;

  update public.profiles
  set is_subscribed = coalesce(v_admin_override, v_has_paid_access)
  where user_id = p_user_id;
end;
$$;

revoke all on function private.reconcile_subscription_access(uuid,boolean) from public, anon, authenticated, service_role;

create or replace function private.record_manual_payment_impl(
  _target_user_id uuid,
  _amount numeric,
  _reference text,
  _note text,
  _plan_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
  v_reference text := nullif(trim(_reference), '');
  v_note text := nullif(trim(_note), '');
begin
  if auth.uid() is null or not (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    or private.has_role(auth.uid(), 'moderator'::public.app_role)
  ) then
    raise exception 'Customer care access required';
  end if;
  if _target_user_id is null then raise exception 'Select a customer first'; end if;
  if _amount is null or _amount <= 0 then raise exception 'Enter a valid payment amount'; end if;
  if v_reference is null then raise exception 'Enter the bank transfer or receipt reference'; end if;
  if v_note is null then raise exception 'Add a short verification note'; end if;
  if not exists (select 1 from public.profiles where user_id = _target_user_id) then
    raise exception 'Customer account was not found';
  end if;

  insert into public.payments (user_id, amount, currency, status, payment_method, reference, plan_id, verified_at)
  values (_target_user_id, _amount, 'NGN', 'success', 'manual_bank_transfer', v_reference, _plan_id, now())
  returning id into v_payment_id;

  update public.profiles
  set is_subscribed = true,
      subscription_admin_override = case
        when subscription_admin_override is false then null
        else subscription_admin_override
      end,
      updated_at = now()
  where user_id = _target_user_id;

  insert into public.admin_audit_logs (actor_user_id, action, target_user_id, details)
  values (auth.uid(), 'manual_payment_verified', _target_user_id,
    jsonb_build_object('payment_id', v_payment_id, 'amount', _amount, 'currency', 'NGN',
      'reference', v_reference, 'note', v_note, 'plan_id', _plan_id));
  return v_payment_id;
end;
$$;

create or replace function public.confirm_paystack_payment(
  p_reference text,
  p_amount_kobo bigint,
  p_currency text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_expected_amount_kobo bigint;
begin
  if p_reference is null or length(trim(p_reference)) = 0 or length(p_reference) > 100
     or p_amount_kobo is null or p_amount_kobo <= 0
     or p_currency is distinct from 'NGN' then
    return jsonb_build_object('confirmed', false, 'reason', 'invalid_payment_details');
  end if;

  select * into v_payment
  from public.payments
  where reference = p_reference
  for update;

  if not found then
    return jsonb_build_object('confirmed', false, 'reason', 'payment_not_found');
  end if;

  v_expected_amount_kobo := round(v_payment.amount * 100)::bigint;
  if v_payment.payment_method <> 'paystack'
     or v_payment.currency <> p_currency
     or p_amount_kobo <> v_expected_amount_kobo then
    return jsonb_build_object('confirmed', false, 'reason', 'payment_details_mismatch');
  end if;

  if v_payment.status = 'success' then
    if v_payment.paystack_reference = p_reference and v_payment.verified_at is not null then
      perform private.reconcile_subscription_access(v_payment.user_id, false);
      return jsonb_build_object('confirmed', true, 'reason', 'already_confirmed');
    end if;
    return jsonb_build_object('confirmed', false, 'reason', 'payment_already_recorded');
  end if;

  if v_payment.status <> 'pending' then
    return jsonb_build_object('confirmed', false, 'reason', 'payment_not_pending');
  end if;

  update public.payments
  set status = 'success',
      paystack_reference = p_reference,
      verified_at = now()
  where id = v_payment.id
    and status = 'pending';
  if not found then
    raise exception 'Verified payment could not be recorded.';
  end if;

  perform private.reconcile_subscription_access(v_payment.user_id, true);

  return jsonb_build_object('confirmed', true, 'reason', 'confirmed');
end;
$$;

revoke all on function public.confirm_paystack_payment(text,bigint,text) from public, anon, authenticated;
grant execute on function public.confirm_paystack_payment(text,bigint,text) to service_role;

create or replace function public.reconcile_paystack_subscription(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
begin
  if p_payment_id is null then
    return jsonb_build_object('reconciled', false, 'reason', 'payment_id_required');
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;
  if not found then
    return jsonb_build_object('reconciled', false, 'reason', 'payment_not_found');
  end if;
  if v_payment.payment_method is distinct from 'paystack'
     or v_payment.status is distinct from 'success'
     or v_payment.verified_at is null then
    return jsonb_build_object('reconciled', false, 'reason', 'payment_not_eligible');
  end if;

  perform private.reconcile_subscription_access(v_payment.user_id, false);
  return jsonb_build_object('reconciled', true);
end;
$$;

revoke all on function public.reconcile_paystack_subscription(uuid) from public, anon, authenticated;
grant execute on function public.reconcile_paystack_subscription(uuid) to service_role;

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

drop function if exists public.reverse_referral_reward(text,bigint);

create or replace function public.reverse_referral_reward(
  p_payment_reference text,
  p_refund_id text,
  p_refund_amount_kobo bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_reward public.referral_rewards%rowtype;
  v_profile public.referral_profiles%rowtype;
  v_wallet public.referral_wallets%rowtype;
  v_inserted_refund_id text;
  v_refund_id text;
  v_existing_payment_id uuid;
  v_existing_amount_kobo bigint;
  v_expected_amount_kobo bigint;
  v_total_refunded_kobo bigint;
  v_deduct numeric(12,2);
  v_recovery numeric(12,2);
begin
  v_refund_id := nullif(trim(p_refund_id), '');
  if p_payment_reference is null or length(trim(p_payment_reference)) = 0
     or v_refund_id is null or length(v_refund_id) > 100
     or p_refund_amount_kobo is null or p_refund_amount_kobo <= 0 then
    raise exception 'Refund details are invalid.';
  end if;

  select * into v_payment
  from public.payments
  where reference = p_payment_reference
  for update;
  if not found then
    return jsonb_build_object('reversed', false, 'reason', 'payment_not_found');
  end if;

  if v_payment.payment_method is distinct from 'paystack'
     or v_payment.currency is distinct from 'NGN'
     or v_payment.status not in ('success','refunded')
     or v_payment.verified_at is null
     or v_payment.amount <= 0 then
    return jsonb_build_object('reversed', false, 'reason', 'payment_not_eligible');
  end if;

  v_expected_amount_kobo := round(v_payment.amount * 100)::bigint;

  insert into public.paystack_refund_events(paystack_refund_id, payment_id, amount_kobo)
  values (v_refund_id, v_payment.id, p_refund_amount_kobo)
  on conflict (paystack_refund_id) do nothing
  returning paystack_refund_id into v_inserted_refund_id;

  if v_inserted_refund_id is null then
    select payment_id, amount_kobo
    into v_existing_payment_id, v_existing_amount_kobo
    from public.paystack_refund_events
    where paystack_refund_id = v_refund_id;

    if v_existing_payment_id is distinct from v_payment.id
       or v_existing_amount_kobo is distinct from p_refund_amount_kobo then
      raise exception 'Paystack refund ID was already recorded with different details.';
    end if;

    return jsonb_build_object('reversed', false, 'reason', 'already_processed');
  end if;

  select coalesce(sum(amount_kobo), 0)::bigint
  into v_total_refunded_kobo
  from public.paystack_refund_events
  where payment_id = v_payment.id;

  if v_total_refunded_kobo > v_expected_amount_kobo then
    raise exception 'Cumulative refunds cannot exceed the original payment amount.';
  end if;

  update public.payments
  set refunded_amount_kobo = v_total_refunded_kobo,
      status = case
        when v_total_refunded_kobo = v_expected_amount_kobo then 'refunded'
        else 'success'
      end
  where id = v_payment.id;
  if not found then
    raise exception 'Payment refund total could not be updated.';
  end if;

  if v_total_refunded_kobo < v_expected_amount_kobo then
    return jsonb_build_object(
      'reversed', false,
      'recorded', true,
      'reason', 'partial_refund',
      'cumulative_refund_kobo', v_total_refunded_kobo
    );
  end if;

  perform private.reconcile_subscription_access(v_payment.user_id, false);

  select * into v_reward
  from public.referral_rewards
  where payment_id = v_payment.id
  for update;
  if not found then
    return jsonb_build_object(
      'reversed', false,
      'payment_refunded', true,
      'reason', 'no_referral_reward',
      'cumulative_refund_kobo', v_total_refunded_kobo
    );
  end if;

  if v_reward.status = 'reversed' then
    return jsonb_build_object(
      'reversed', false,
      'payment_refunded', true,
      'reason', 'already_reversed',
      'cumulative_refund_kobo', v_total_refunded_kobo
    );
  end if;

  select * into v_profile
  from public.referral_profiles
  where user_id = v_reward.referrer_user_id
  for update;
  if not found then
    raise exception 'Referral profile not found.';
  end if;

  select * into v_wallet
  from public.referral_wallets
  where user_id = v_reward.referrer_user_id
  for update;
  if not found then
    raise exception 'Referral wallet not found.';
  end if;

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
     'Referral reward reversed after cumulative refunds fully refunded the payment')
  on conflict (idempotency_key) do nothing;

  if v_recovery > 0 then
    update public.referral_profiles
    set withdrawals_blocked = true,
        withdrawals_block_reason = 'A referred payment was refunded after its reward had been used. Future referral earnings will repay the outstanding balance before withdrawals are re-enabled.',
        withdrawals_blocked_at = now(),
        withdrawals_blocked_by = null,
        withdrawals_block_source = 'refund_recovery'
    where user_id = v_reward.referrer_user_id;
  end if;

  return jsonb_build_object(
    'reversed', true,
    'payment_refunded', true,
    'deducted', v_deduct,
    'recovery_balance_added', v_recovery,
    'cumulative_refund_kobo', v_total_refunded_kobo
  );
end;
$$;

revoke all on function public.reverse_referral_reward(text,text,bigint) from public, anon, authenticated;
grant execute on function public.reverse_referral_reward(text,text,bigint) to service_role;

create or replace function public.credit_referral_reward(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_referrer uuid;
  v_profile public.referral_profiles%rowtype;
  v_reward_id uuid;
  v_recovery_applied numeric(12,2);
  v_net_credit numeric(12,2);
begin
  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;
  if not found then
    return jsonb_build_object('credited', false, 'reason', 'payment_not_found');
  end if;

  if v_payment.status <> 'success'
     or v_payment.payment_method is distinct from 'paystack'
     or v_payment.currency is distinct from 'NGN'
     or v_payment.amount is distinct from 2500
     or v_payment.plan_id is distinct from 'lifetime_access'
     or v_payment.verified_at is null
     or v_payment.refunded_amount_kobo >= round(v_payment.amount * 100)::bigint then
    return jsonb_build_object('credited', false, 'reason', 'payment_not_eligible');
  end if;

  select a.referrer_user_id into v_referrer
  from public.referral_attributions a
  where a.referred_user_id = v_payment.user_id;
  if v_referrer is null or v_referrer = v_payment.user_id then
    return jsonb_build_object('credited', false, 'reason', 'no_valid_referrer');
  end if;

  select * into v_profile
  from public.referral_profiles
  where user_id = v_referrer
  for update;
  if not found then
    return jsonb_build_object('credited', false, 'reason', 'referrer_profile_not_found');
  end if;

  insert into public.referral_rewards
    (payment_id, referrer_user_id, referred_user_id, amount, status, available_at)
  values
    (v_payment.id, v_referrer, v_payment.user_id, 500, 'available', now())
  on conflict (payment_id) do nothing
  returning id into v_reward_id;
  if v_reward_id is null then
    return jsonb_build_object('credited', false, 'reason', 'already_credited');
  end if;

  insert into public.referral_wallets(user_id)
  values (v_referrer)
  on conflict (user_id) do nothing;

  select recovery_balance into v_recovery_applied
  from public.referral_wallets
  where user_id = v_referrer
  for update;
  if not found then
    raise exception 'Referral wallet not found.';
  end if;

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
    values
      (v_referrer, 'reward_available', v_net_credit, 'posted', 'referral_reward', v_reward_id,
       'referral-reward:' || v_payment.id::text,
       'Net referral reward credited after recovery offset');
  end if;

  if v_recovery_applied > 0 then
    insert into public.referral_wallet_transactions
      (user_id, transaction_type, amount, status, reference_type, reference_id, idempotency_key, description)
    values
      (v_referrer, 'recovery_applied', v_recovery_applied, 'posted', 'referral_reward', v_reward_id,
       'referral-recovery-applied:' || v_payment.id::text,
       'New referral reward applied to outstanding refund recovery');
  end if;

  if (select recovery_balance from public.referral_wallets where user_id = v_referrer) = 0 then
    update public.referral_profiles
    set withdrawals_blocked = false,
        withdrawals_block_reason = null,
        withdrawals_blocked_at = null,
        withdrawals_blocked_by = null,
        withdrawals_block_source = null
    where user_id = v_referrer
      and withdrawals_block_source = 'refund_recovery';
  end if;

  return jsonb_build_object(
    'credited', true,
    'reward_id', v_reward_id,
    'amount', 500,
    'available_credit', v_net_credit,
    'recovery_applied', v_recovery_applied
  );
end;
$$;

revoke all on function public.credit_referral_reward(uuid) from public, anon, authenticated;
grant execute on function public.credit_referral_reward(uuid) to service_role;

create or replace function public.get_referral_admin_summary(
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_actor_user_id is null or not exists (
    select 1 from public.user_roles
    where user_id = p_actor_user_id and role = 'admin'
  ) then
    raise exception 'Only platform administrators can view referral financial summaries.';
  end if;

  with wallet_totals as (
    select
      count(*)::bigint as users,
      coalesce(sum(available_balance), 0) as available_balance,
      coalesce(sum(pending_balance), 0) as pending_balance,
      coalesce(sum(lifetime_earned), 0) as lifetime_earned,
      coalesce(sum(lifetime_paid), 0) as lifetime_paid,
      coalesce(sum(recovery_balance), 0) as recovery_balance
    from public.referral_wallets
  ),
  referred_payments as (
    select p.id, p.user_id, p.amount, p.refunded_amount_kobo, p.status, p.verified_at
    from public.payments p
    join public.referral_attributions a on a.referred_user_id = p.user_id
    where p.status in ('success','refunded')
      and p.payment_method = 'paystack'
      and p.amount = 2500
      and p.currency = 'NGN'
      and p.plan_id = 'lifetime_access'
      and p.verified_at is not null
  ),
  monthly_revenue as (
    select date_trunc('month', verified_at)::date as month,
      count(*) filter (where status = 'success')::bigint as subscriptions,
      count(*)::bigint as payments,
      coalesce(sum(amount), 0) as gross_revenue
    from referred_payments
    group by date_trunc('month', verified_at)::date
  ),
  monthly_refunds as (
    select date_trunc('month', refund.recorded_at)::date as month,
      coalesce(sum(refund.amount_kobo::numeric / 100), 0) as refunds
    from public.paystack_refund_events refund
    join referred_payments payment on payment.id = refund.payment_id
    group by date_trunc('month', refund.recorded_at)::date
  ),
  qualifying_rewards as (
    select r.payment_id, r.amount, p.verified_at
    from public.referral_rewards r
    join referred_payments p on p.id = r.payment_id
    where r.status <> 'reversed'
      and p.status = 'success'
  ),
  monthly_rewards as (
    select date_trunc('month', verified_at)::date as month,
      coalesce(sum(amount), 0) as reward_cost
    from qualifying_rewards
    group by date_trunc('month', verified_at)::date
  ),
  months as (
    select month from monthly_revenue
    union
    select month from monthly_refunds
    union
    select month from monthly_rewards
  )
  select jsonb_build_object(
    'summary', (
      select jsonb_build_object(
        'users', w.users,
        'available_balance', w.available_balance,
        'pending_balance', w.pending_balance,
        'lifetime_earned', w.lifetime_earned,
        'lifetime_paid', w.lifetime_paid,
        'recovery_balance', w.recovery_balance,
        'verified_payments', (select count(*) from referred_payments),
        'active_subscriptions', (select count(*) from referred_payments where status = 'success'),
        'gross_revenue', coalesce((select sum(amount) from referred_payments), 0),
        'refunds', coalesce((
          select sum(refunded_amount_kobo::numeric / 100) from referred_payments
        ), 0),
        'net_revenue', coalesce((
          select sum(amount - refunded_amount_kobo::numeric / 100) from referred_payments
        ), 0),
        'referral_reward_cost', coalesce((select sum(amount) from qualifying_rewards), 0),
        'completed_payouts', coalesce((
          select sum(amount) from public.referral_withdrawals where status = 'success'
        ), 0),
        'completed_payout_count', (
          select count(*) from public.referral_withdrawals where status = 'success'
        ),
        'reserved_payouts', coalesce((
          select sum(amount) from public.referral_withdrawals where status in ('queued','otp','processing')
        ), 0),
        'reserved_payout_count', (
          select count(*) from public.referral_withdrawals where status in ('queued','otp','processing')
        ),
        'failed_payouts', coalesce((
          select sum(amount) from public.referral_withdrawals where status = 'failed'
        ), 0),
        'failed_payout_count', (
          select count(*) from public.referral_withdrawals where status = 'failed'
        ),
        'reversed_payouts', coalesce((
          select sum(amount) from public.referral_withdrawals where status = 'reversed'
        ), 0),
        'reversed_payout_count', (
          select count(*) from public.referral_withdrawals where status = 'reversed'
        ),
        'net_after_reward_cost',
          coalesce((
            select sum(amount - refunded_amount_kobo::numeric / 100) from referred_payments
          ), 0) -
          coalesce((select sum(amount) from qualifying_rewards), 0),
        'rewards', (select count(*) from public.referral_rewards),
        'withdrawals', (select count(*) from public.referral_withdrawals)
      )
      from wallet_totals w
    ),
    'monthly_referral_performance', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'month', to_char(m.month, 'YYYY-MM'),
          'subscriptions', coalesce(r.subscriptions, 0),
          'payments', coalesce(r.payments, 0),
          'gross_revenue', coalesce(r.gross_revenue, 0),
          'refunds', coalesce(f.refunds, 0),
          'net_revenue', coalesce(r.gross_revenue, 0) - coalesce(f.refunds, 0),
          'reward_cost', coalesce(w.reward_cost, 0),
          'net_after_rewards',
            coalesce(r.gross_revenue, 0) - coalesce(f.refunds, 0) - coalesce(w.reward_cost, 0)
        )
        order by m.month
      )
      from months m
      left join monthly_revenue r on r.month = m.month
      left join monthly_refunds f on f.month = m.month
      left join monthly_rewards w on w.month = m.month
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_referral_admin_summary(uuid) from public, anon, authenticated;
grant execute on function public.get_referral_admin_summary(uuid) to service_role;
