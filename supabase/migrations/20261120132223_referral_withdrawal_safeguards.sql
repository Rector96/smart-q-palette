-- Referral withdrawal safeguards: admin holds, audit trail, and one active payout per customer.
alter table public.referral_profiles
  add column if not exists withdrawals_blocked boolean not null default false,
  add column if not exists withdrawals_block_reason text,
  add column if not exists withdrawals_blocked_at timestamptz,
  add column if not exists withdrawals_blocked_by uuid references auth.users(id) on delete set null;

alter table public.referral_profiles
  drop constraint if exists referral_profiles_withdrawal_block_reason_check;
alter table public.referral_profiles
  add constraint referral_profiles_withdrawal_block_reason_check
  check (withdrawals_block_reason is null or length(withdrawals_block_reason) <= 500);

create table if not exists public.referral_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('withdrawals_blocked','withdrawals_unblocked')),
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists referral_admin_audit_target_idx
  on public.referral_admin_audit(target_user_id, created_at desc);
alter table public.referral_admin_audit enable row level security;
revoke all on public.referral_admin_audit from anon, authenticated;

-- A customer may have only one request being processed at a time.
create unique index if not exists referral_one_active_withdrawal_per_user
  on public.referral_withdrawals(user_id)
  where status in ('queued','otp','processing');

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
  v_profile public.referral_profiles%rowtype;
  v_withdrawal_id uuid;
begin
  if p_user_id is null or p_bank_account_id is null then
    raise exception 'Withdrawal details are incomplete.';
  end if;
  if p_amount is null or p_amount < 1000 or p_amount <> trunc(p_amount) then
    raise exception 'Minimum withdrawal is ₦1,000 and amount must be a whole naira value.';
  end if;
  if p_reference is null or p_reference !~ '^[a-z0-9_-]{12,100}$' then
    raise exception 'Invalid withdrawal reference.';
  end if;

  select * into v_profile
  from public.referral_profiles
  where user_id = p_user_id
  for update;
  if not found then raise exception 'Referral profile not found.'; end if;
  if v_profile.withdrawals_blocked then
    raise exception 'Withdrawals are temporarily restricted on this account. Contact support for assistance.';
  end if;

  if exists (
    select 1 from public.referral_withdrawals
    where user_id = p_user_id and status in ('queued','otp','processing')
  ) then
    raise exception 'You already have a withdrawal being processed. Wait for its result before submitting another.';
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

revoke all on function public.reserve_referral_withdrawal(uuid,uuid,numeric,text) from public, anon, authenticated;
grant execute on function public.reserve_referral_withdrawal(uuid,uuid,numeric,text) to service_role;
