-- Reapply atomic payment confirmation after the referral/payment hardening migration.
-- Keep the established p_reference RPC argument name for PostgREST compatibility.
-- Row locking serializes confirmation against record_paystack_refund.

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
  if v_payment.payment_method is distinct from 'paystack'
     or v_payment.currency is distinct from p_currency
     or p_amount_kobo <> v_expected_amount_kobo then
    return jsonb_build_object('confirmed', false, 'reason', 'payment_details_mismatch');
  end if;

  if v_payment.status in ('partially_refunded', 'refunded') then
    return jsonb_build_object('confirmed', false, 'reason', 'payment_already_refunded', 'status', v_payment.status);
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
  where id = v_payment.id and status = 'pending';
  if not found then
    raise exception 'Verified payment could not be recorded.';
  end if;

  -- The existing payment-status trigger credits eligible referral rewards.
  perform private.reconcile_subscription_access(v_payment.user_id, true);

  return jsonb_build_object('confirmed', true, 'reason', 'confirmed');
end;
$$;

revoke all on function public.confirm_paystack_payment(text,bigint,text) from public, anon, authenticated;
grant execute on function public.confirm_paystack_payment(text,bigint,text) to service_role;
