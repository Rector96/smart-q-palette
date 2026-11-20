-- Smart Q Palette referral programme foundation.
-- Referral attribution and commissions are server-owned; clients receive read-only access
-- to their own referral data. No live Paystack transfer is initiated by this migration.

create table public.referral_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  referral_code text not null unique,
  created_at timestamptz not null default now(),
  constraint referral_profiles_code_format check (referral_code ~ '^[A-Z0-9]{10,16}$')
);

create table public.referral_attributions (
  referred_user_id uuid primary key references auth.users(id) on delete cascade,
  referrer_user_id uuid not null references auth.users(id) on delete restrict,
  referral_code text not null,
  attributed_at timestamptz not null default now(),
  constraint referral_attributions_no_self_referral check (referred_user_id <> referrer_user_id)
);

create index referral_attributions_referrer_idx
  on public.referral_attributions(referrer_user_id, attributed_at desc);

create table public.referral_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank_code text not null,
  bank_name text not null,
  account_name text not null,
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
  paystack_recipient_code text not null unique,
  is_default boolean not null default false,
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index referral_bank_accounts_one_default_per_user
  on public.referral_bank_accounts(user_id) where is_default = true;

create table public.referral_withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  bank_account_id uuid not null,
  amount numeric(12,2) not null check (amount >= 1000),
  currency text not null default 'NGN' check (currency = 'NGN'),
  status text not null default 'processing'
    check (status in ('processing', 'success', 'failed', 'reversed')),
  transfer_reference text not null unique,
  paystack_transfer_code text,
  failure_reason text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (bank_account_id, user_id)
    references public.referral_bank_accounts(id, user_id) on delete restrict
);

create index referral_withdrawals_user_idx
  on public.referral_withdrawals(user_id, requested_at desc);

create table public.referral_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  entry_type text not null
    check (entry_type in ('referral_commission', 'withdrawal_debit', 'withdrawal_refund', 'commission_reversal', 'admin_adjustment')),
  amount numeric(12,2) not null check (amount <> 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  payment_id uuid references public.payments(id) on delete restrict,
  withdrawal_id uuid references public.referral_withdrawals(id) on delete restrict,
  source_key text not null unique,
  description text,
  created_at timestamptz not null default now(),
  constraint referral_wallet_transaction_source_check check (
    (entry_type = 'referral_commission' and amount > 0 and payment_id is not null and withdrawal_id is null)
    or (entry_type = 'withdrawal_debit' and amount < 0 and withdrawal_id is not null and payment_id is null)
    or (entry_type = 'withdrawal_refund' and amount > 0 and withdrawal_id is not null and payment_id is null)
    or (entry_type = 'commission_reversal' and amount < 0 and payment_id is not null and withdrawal_id is null)
    or (entry_type = 'admin_adjustment' and payment_id is null and withdrawal_id is null)
  )
);

create index referral_wallet_transactions_user_idx
  on public.referral_wallet_transactions(user_id, created_at desc);

create unique index referral_wallet_one_commission_per_payment
  on public.referral_wallet_transactions(payment_id)
  where entry_type = 'referral_commission';

alter table public.referral_profiles enable row level security;
alter table public.referral_attributions enable row level security;
alter table public.referral_bank_accounts enable row level security;
alter table public.referral_withdrawals enable row level security;
alter table public.referral_wallet_transactions enable row level security;

revoke all on public.referral_profiles, public.referral_attributions,
  public.referral_bank_accounts, public.referral_withdrawals,
  public.referral_wallet_transactions from anon, authenticated;

grant select on public.referral_profiles, public.referral_attributions,
  public.referral_bank_accounts, public.referral_withdrawals,
  public.referral_wallet_transactions to authenticated;

create policy referral_profiles_select_own
  on public.referral_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy referral_attributions_select_as_referrer
  on public.referral_attributions for select to authenticated
  using ((select auth.uid()) = referrer_user_id);

create policy referral_bank_accounts_select_own
  on public.referral_bank_accounts for select to authenticated
  using ((select auth.uid()) = user_id);

create policy referral_withdrawals_select_own
  on public.referral_withdrawals for select to authenticated
  using ((select auth.uid()) = user_id);

create policy referral_wallet_transactions_select_own
  on public.referral_wallet_transactions for select to authenticated
  using ((select auth.uid()) = user_id);

-- Aggregate balances across the complete immutable ledger, not just recent activity.
create or replace view public.referral_wallet_balances
with (security_invoker = true)
as
select
  user_id,
  coalesce(sum(amount), 0)::numeric(12,2) as available_balance,
  coalesce(sum(amount) filter (where entry_type = 'referral_commission'), 0)::numeric(12,2) as total_earned
from public.referral_wallet_transactions
group by user_id;

revoke all on public.referral_wallet_balances from anon, authenticated;
grant select on public.referral_wallet_balances to authenticated;

-- Give every account that already exists a referral code as well as new signups.
insert into public.referral_profiles (user_id, referral_code)
select u.id, upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
from auth.users u
on conflict (user_id) do nothing;

-- Create referral identity for every new account. Referral codes supplied through
-- user metadata are treated only as untrusted input and resolved against server records.
create or replace function private.create_referral_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_referral_code text;
  v_referrer_id uuid;
begin
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    begin
      insert into public.referral_profiles (user_id, referral_code)
      values (new.id, v_code);
      exit;
    exception when unique_violation then
      if exists (select 1 from public.referral_profiles where user_id = new.id) then
        exit;
      end if;
    end;
  end loop;

  v_referral_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'referral_code', '')));
  if v_referral_code <> '' then
    select rp.user_id into v_referrer_id
    from public.referral_profiles rp
    where rp.referral_code = v_referral_code
      and rp.user_id <> new.id
    limit 1;

    if v_referrer_id is not null then
      insert into public.referral_attributions (referred_user_id, referrer_user_id, referral_code)
      values (new.id, v_referrer_id, v_referral_code)
      on conflict (referred_user_id) do nothing;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.create_referral_profile_for_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_referral_profile_created on auth.users;
create trigger on_auth_user_referral_profile_created
  after insert on auth.users
  for each row execute function private.create_referral_profile_for_new_user();

-- Award one ₦500 commission only when a Paystack lifetime payment transitions
-- from a non-success state to verified success at the database layer.
create or replace function private.award_referral_commission_on_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referrer_id uuid;
begin
  if new.status <> 'success'
     or old.status = 'success'
     or new.payment_method <> 'paystack'
     or new.plan_id <> 'lifetime_access'
     or new.currency <> 'NGN'
     or new.amount <> 2500 then
    return new;
  end if;

  select ra.referrer_user_id into v_referrer_id
  from public.referral_attributions ra
  where ra.referred_user_id = new.user_id;

  if v_referrer_id is not null then
    insert into public.referral_wallet_transactions (
      user_id, entry_type, amount, payment_id, source_key, description
    )
    values (
      v_referrer_id,
      'referral_commission',
      500,
      new.id,
      'referral-payment:' || new.id::text,
      'Referral commission for a verified Smart Q Palette payment'
    )
    on conflict (source_key) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.award_referral_commission_on_payment() from public, anon, authenticated;

drop trigger if exists award_referral_commission_after_payment_success on public.payments;
create trigger award_referral_commission_after_payment_success
  after update of status on public.payments
  for each row
  when (new.status = 'success' and old.status is distinct from 'success')
  execute function private.award_referral_commission_on_payment();

create or replace function private.set_referral_withdrawal_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_referral_withdrawal_updated_at() from public, anon, authenticated;

create trigger referral_withdrawals_set_updated_at
  before update on public.referral_withdrawals
  for each row execute function private.set_referral_withdrawal_updated_at();

-- Enable live wallet-ledger updates for subscribed clients when the default
-- Supabase Realtime publication is present.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'referral_wallet_transactions'
     ) then
    alter publication supabase_realtime add table public.referral_wallet_transactions;
  end if;
end;
$$;
