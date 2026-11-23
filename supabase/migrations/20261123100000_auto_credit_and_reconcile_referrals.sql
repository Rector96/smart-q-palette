-- Automatically retry referral reward credit whenever a qualifying payment becomes successful.
-- The credit function is idempotent (unique payment reward + wallet ledger key).
create or replace function private.credit_referral_reward_on_payment_success()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'success'
     and new.currency = 'NGN'
     and new.amount = 2500
     and (tg_op = 'INSERT' or old.status is distinct from 'success') then
    perform public.credit_referral_reward(new.id);
  end if;
  return new;
end;
$$;

revoke all on function private.credit_referral_reward_on_payment_success() from public, anon, authenticated;

drop trigger if exists payments_credit_referral_reward on public.payments;
create trigger payments_credit_referral_reward
  after insert or update of status on public.payments
  for each row execute function private.credit_referral_reward_on_payment_success();

-- Safe idempotent reconciliation helper for past successful referred payments
-- that have not yet received a reward. Restricted to service-role use.
create or replace function public.reconcile_missing_referral_rewards()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment record;
  v_result jsonb;
  v_processed integer := 0;
  v_credited integer := 0;
begin
  for v_payment in
    select p.id
    from public.payments p
    join public.referral_attributions a on a.referred_user_id = p.user_id
    left join public.referral_rewards r on r.payment_id = p.id
    where p.status = 'success'
      and p.currency = 'NGN'
      and p.amount = 2500
      and r.id is null
    order by p.verified_at nulls last, p.created_at
  loop
    v_result := public.credit_referral_reward(v_payment.id);
    v_processed := v_processed + 1;
    if coalesce((v_result->>'credited')::boolean, false) then
      v_credited := v_credited + 1;
    end if;
  end loop;
  return jsonb_build_object('scanned', v_processed, 'credited', v_credited);
end;
$$;
revoke all on function public.reconcile_missing_referral_rewards() from public, anon, authenticated;
grant execute on function public.reconcile_missing_referral_rewards() to service_role;
