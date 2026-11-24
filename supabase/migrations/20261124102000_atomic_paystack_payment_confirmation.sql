-- Serialize payment confirmation against refund processing.
-- This prevents a delayed charge.success webhook or verification callback from
-- restoring access after a refund has already been recorded.

create or replace function public.confirm_paystack_payment(
  p_payment_reference text,
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
  v_referral_result jsonb;
begin
  if p_payment_reference is null or length(trim(p_payment_reference)) = 0
     or length(p_payment_reference) > 100
     or p_amount_kobo is null or p_amount_kobo <= 0
     or p_currency is distinct from 'NGN' then
    raise exception 'Payment confirmation details are invalid.';
  end if;

  select * into v_payment
  from public.payments
  where reference = p_payment_reference
  for update;

  if not found then
    return jsonb_build_object('confirmed', false, 'reason', 'payment_not_found');
  end if;

  v_expected_amount_kobo := round(v_payment.amount * 100)::bigint;
  if v_payment.currency <> 'NGN' or p_amount_kobo <> v_expected_amount_kobo then
    return jsonb_build_object('confirmed', false, 'reason', 'payment_mismatch');
  end if;

  if v_payment.status in ('partially_refunded', 'refunded') then
    return jsonb_build_object('confirmed', false, 'reason', 'payment_already_refunded', 'status', v_payment.status);
  end if;

  if v_payment.status not in ('pending', 'success', 'failed') then
    return jsonb_build_object('confirmed', false, 'reason', 'payment_not_confirmable', 'status', v_payment.status);
  end if;

  update public.payments
  set status = 'success',
      paystack_reference = p_payment_reference,
      verified_at = coalesce(verified_at, now())
  where id = v_payment.id;

  update public.profiles
  set is_subscribed = true,
      updated_at = now()
  where user_id = v_payment.user_id;

  select public.credit_referral_reward(v_payment.id)
  into v_referral_result;

  return jsonb_build_object(
    'confirmed', true,
    'status', 'success',
    'referral', v_referral_result
  );
end;
$$;

revoke all on function public.confirm_paystack_payment(text, bigint, text) from public, anon, authenticated;
grant execute on function public.confirm_paystack_payment(text, bigint, text) to service_role;
