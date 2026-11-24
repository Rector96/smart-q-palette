-- Track Paystack refunds idempotently and revoke lifetime access only after a full refund.
-- Apply to staging first. Do not apply directly to production without backup and approval.

alter table public.payments
  drop constraint if exists payments_status_check;

alter table public.payments
  add constraint payments_status_check
  check (status in ('pending', 'success', 'failed', 'partially_refunded', 'refunded'));

create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  provider text not null default 'paystack' check (provider = 'paystack'),
  provider_refund_id text not null,
  amount_kobo bigint not null check (amount_kobo > 0),
  currency text not null check (currency = 'NGN'),
  created_at timestamptz not null default now(),
  unique (provider, provider_refund_id)
);

create index if not exists payment_refunds_payment_id_idx
  on public.payment_refunds(payment_id, created_at);

alter table public.payment_refunds enable row level security;
revoke all on public.payment_refunds from public, anon, authenticated;
grant select on public.payment_refunds to service_role;
grant insert, select on public.payment_refunds to service_role;

create or replace function public.record_paystack_refund(
  p_payment_reference text,
  p_provider_refund_id text,
  p_refund_amount_kobo bigint,
  p_currency text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_inserted_id uuid;
  v_refunded_kobo bigint;
  v_expected_kobo bigint;
  v_referral_result jsonb;
  v_has_other_paid_payment boolean;
begin
  if p_payment_reference is null or length(trim(p_payment_reference)) = 0
     or length(p_payment_reference) > 100
     or p_provider_refund_id is null or length(trim(p_provider_refund_id)) = 0
     or length(p_provider_refund_id) > 100
     or p_refund_amount_kobo is null or p_refund_amount_kobo <= 0
     or p_currency <> 'NGN' then
    raise exception 'Refund details are invalid.';
  end if;

  select * into v_payment
  from public.payments
  where reference = p_payment_reference
  for update;

  if not found then
    return jsonb_build_object('recorded', false, 'reason', 'payment_not_found');
  end if;

  if v_payment.status not in ('success', 'partially_refunded', 'refunded') then
    return jsonb_build_object('recorded', false, 'reason', 'payment_not_refundable');
  end if;

  insert into public.payment_refunds (
    payment_id, provider_refund_id, amount_kobo, currency
  ) values (
    v_payment.id, p_provider_refund_id, p_refund_amount_kobo, p_currency
  )
  on conflict (provider, provider_refund_id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    return jsonb_build_object('recorded', true, 'duplicate', true, 'status', v_payment.status);
  end if;

  select coalesce(sum(amount_kobo), 0)::bigint
  into v_refunded_kobo
  from public.payment_refunds
  where payment_id = v_payment.id;

  v_expected_kobo := round(v_payment.amount * 100)::bigint;

  if v_refunded_kobo > v_expected_kobo then
    raise exception 'Cumulative refunds exceed the original payment amount.';
  end if;

  if v_refunded_kobo < v_expected_kobo then
    update public.payments
    set status = 'partially_refunded'
    where id = v_payment.id;

    return jsonb_build_object(
      'recorded', true, 'duplicate', false, 'status', 'partially_refunded',
      'refunded_kobo', v_refunded_kobo, 'expected_kobo', v_expected_kobo
    );
  end if;

  update public.payments
  set status = 'refunded'
  where id = v_payment.id;

  -- Reverse the referral reward only once the original payment is fully refunded.
  -- This existing RPC handles both unspent rewards and already-spent reward recovery.
  select public.reverse_referral_reward(p_payment_reference, v_refunded_kobo)
  into v_referral_result;

  select exists (
    select 1
    from public.payments p
    where p.user_id = v_payment.user_id
      and p.id <> v_payment.id
      and p.status = 'success'
  ) into v_has_other_paid_payment;

  update public.profiles
  set is_subscribed = v_has_other_paid_payment,
      updated_at = now()
  where user_id = v_payment.user_id;

  return jsonb_build_object(
    'recorded', true, 'duplicate', false, 'status', 'refunded',
    'refunded_kobo', v_refunded_kobo,
    'access_retained', v_has_other_paid_payment,
    'referral_reversal', v_referral_result
  );
end;
$$;

revoke all on function public.record_paystack_refund(text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.record_paystack_refund(text, text, bigint, text) to service_role;
