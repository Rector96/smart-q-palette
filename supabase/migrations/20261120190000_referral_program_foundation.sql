-- Smart Q Palette referral programme: secure database foundation.
-- No client-side writes are permitted to financial records. Server functions will
-- create rewards, ledger entries, and withdrawals after verifying Paystack events.

create table if not exists public.referral_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  referral_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.referral_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pending_balance numeric(12,2) not null default 0 check (pending_balance >= 0),
  available_balance numeric(12,2) not null default 0 check (available_balance >= 0),
  lifetime_earned numeric(12,2) not null default 0 check (lifetime_earned >= 0),
  lifetime_paid numeric(12,2) not null default 0 check (lifetime_paid >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.referral_attributions (
  referred_user_id uuid primary key references auth.users(id) on delete cascade,
  referrer_user_id uuid not null references auth.users(id) on delete restrict,
  referral_code text not null,
  created_at timestamptz not null default now(),
  constraint referral_no_self_referral check (referred_user_id <> referrer_user_id)
);
create index if not exists referral_attributions_referrer_idx
  on public.referral_attributions(referrer_user_id, created_at desc);

create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id) on delete restrict,
  referrer_user_id uuid not null references auth.users(id) on delete restrict,
  referred_user_id uuid not null references auth.users(id) on delete restrict,
  amount numeric(12,2) not null default 500 check (amount = 500),
  status text not null default 'pending' check (status in ('pending','available','reversed')),
  created_at timestamptz not null default now(),
  available_at timestamptz,
  reversed_at timestamptz,
  constraint referral_reward_not_self check (referrer_user_id <> referred_user_id)
);
create index if not exists referral_rewards_referrer_idx
  on public.referral_rewards(referrer_user_id, created_at desc);

create table if not exists public.referral_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  transaction_type text not null check (transaction_type in (
    'reward_pending','reward_available','withdrawal_reserved',
    'withdrawal_paid','withdrawal_released','reward_reversed','admin_adjustment'
  )),
  amount numeric(12,2) not null check (amount > 0),
  status text not null check (status in ('pending','posted','reversed')),
  reference_type text not null,
  reference_id uuid not null,
  idempotency_key text not null unique,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists referral_wallet_transactions_user_idx
  on public.referral_wallet_transactions(user_id, created_at desc);

create table if not exists public.referral_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank_code text not null,
  bank_name text not null,
  account_name text not null,
  account_number_masked text not null,
  paystack_recipient_code text not null unique,
  is_verified boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists referral_bank_accounts_user_idx
  on public.referral_bank_accounts(user_id, created_at desc);

create table if not exists public.referral_withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  bank_account_id uuid not null references public.referral_bank_accounts(id) on delete restrict,
  amount numeric(12,2) not null check (amount >= 1000),
  currency text not null default 'NGN' check (currency = 'NGN'),
  status text not null default 'queued' check (status in (
    'queued','processing','success','failed','reversed'
  )),
  reference text not null unique,
  paystack_transfer_code text,
  failure_reason text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists referral_withdrawals_user_idx
  on public.referral_withdrawals(user_id, requested_at desc);

-- Give every existing account a referral code and an empty wallet.
insert into public.referral_profiles(user_id, referral_code)
select u.id, 'SQP' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
from auth.users u
on conflict (user_id) do nothing;

insert into public.referral_wallets(user_id)
select u.id from auth.users u
on conflict (user_id) do nothing;

-- New accounts receive a referral code and wallet. A referral code supplied in
-- signup metadata is captured once; unknown codes and self-referrals are ignored.
create or replace function private.handle_referral_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_referrer uuid;
begin
  v_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'referral_code', '')));

  insert into public.referral_profiles(user_id, referral_code)
  values (new.id, 'SQP' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)))
  on conflict (user_id) do nothing;

  insert into public.referral_wallets(user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  if v_code <> '' then
    select rp.user_id into v_referrer
    from public.referral_profiles rp
    where rp.referral_code = v_code
    limit 1;

    if v_referrer is not null and v_referrer <> new.id then
      insert into public.referral_attributions(referred_user_id, referrer_user_id, referral_code)
      values (new.id, v_referrer, v_code)
      on conflict (referred_user_id) do nothing;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.handle_referral_signup() from public, anon, authenticated;

drop trigger if exists on_auth_user_referral_created on auth.users;
create trigger on_auth_user_referral_created
  after insert on auth.users
  for each row execute function private.handle_referral_signup();

alter table public.referral_profiles enable row level security;
alter table public.referral_wallets enable row level security;
alter table public.referral_attributions enable row level security;
alter table public.referral_rewards enable row level security;
alter table public.referral_wallet_transactions enable row level security;
alter table public.referral_bank_accounts enable row level security;
alter table public.referral_withdrawals enable row level security;

revoke all on public.referral_profiles, public.referral_wallets,
  public.referral_attributions, public.referral_rewards,
  public.referral_wallet_transactions, public.referral_bank_accounts,
  public.referral_withdrawals from anon, authenticated;

grant select on public.referral_profiles, public.referral_wallets,
  public.referral_attributions, public.referral_rewards,
  public.referral_wallet_transactions, public.referral_bank_accounts,
  public.referral_withdrawals to authenticated;

create policy referral_profiles_select_own
  on public.referral_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy referral_wallets_select_own
  on public.referral_wallets for select to authenticated
  using ((select auth.uid()) = user_id);

create policy referral_attributions_select_participant
  on public.referral_attributions for select to authenticated
  using ((select auth.uid()) = referred_user_id or (select auth.uid()) = referrer_user_id);

create policy referral_rewards_select_referrer
  on public.referral_rewards for select to authenticated
  using ((select auth.uid()) = referrer_user_id);

create policy referral_wallet_transactions_select_own
  on public.referral_wallet_transactions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy referral_bank_accounts_select_own
  on public.referral_bank_accounts for select to authenticated
  using ((select auth.uid()) = user_id);

create policy referral_withdrawals_select_own
  on public.referral_withdrawals for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function private.set_referral_wallet_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.set_referral_wallet_updated_at() from public, anon, authenticated;

drop trigger if exists referral_wallets_set_updated_at on public.referral_wallets;
create trigger referral_wallets_set_updated_at
  before update on public.referral_wallets
  for each row execute function private.set_referral_wallet_updated_at();

drop trigger if exists referral_bank_accounts_set_updated_at on public.referral_bank_accounts;
create trigger referral_bank_accounts_set_updated_at
  before update on public.referral_bank_accounts
  for each row execute function private.set_referral_wallet_updated_at();


-- Credit one ₦500 referral reward after a verified ₦2,500 payment.
-- The unique payment_id and ledger idempotency key make webhook retries safe.
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
begin
  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    return jsonb_build_object('credited', false, 'reason', 'payment_not_found');
  end if;

  if v_payment.status <> 'success'
     or v_payment.currency <> 'NGN'
     or v_payment.amount <> 2500 then
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
  values
    (v_payment.id, v_referrer, v_payment.user_id, 500, 'available', now())
  on conflict (payment_id) do nothing
  returning id into v_reward_id;

  if v_reward_id is null then
    return jsonb_build_object('credited', false, 'reason', 'already_credited');
  end if;

  insert into public.referral_wallets(user_id, available_balance, lifetime_earned)
  values (v_referrer, 500, 500)
  on conflict (user_id) do update
    set available_balance = public.referral_wallets.available_balance + 500,
        lifetime_earned = public.referral_wallets.lifetime_earned + 500;

  insert into public.referral_wallet_transactions
    (user_id, transaction_type, amount, status, reference_type, reference_id, idempotency_key, description)
  values
    (v_referrer, 'reward_available', 500, 'posted', 'referral_reward', v_reward_id,
     'referral-reward:' || v_payment.id::text,
     '₦500 referral reward for a verified ₦2,500 payment');

  return jsonb_build_object('credited', true, 'reward_id', v_reward_id, 'amount', 500);
end;
$$;

revoke all on function public.credit_referral_reward(uuid) from public, anon, authenticated;
grant execute on function public.credit_referral_reward(uuid) to service_role;
