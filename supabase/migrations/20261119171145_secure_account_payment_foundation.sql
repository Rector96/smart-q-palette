create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create type public.app_role as enum ('admin', 'moderator', 'user');

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  preferred_subjects text[] not null default '{}',
  trial_count integer not null default 0 check (trial_count >= 0),
  is_subscribed boolean not null default false,
  ai_tutor_usage integer not null default 0 check (ai_tutor_usage >= 0),
  ai_builder_usage integer not null default 0 check (ai_builder_usage >= 0),
  free_live_quiz_used integer not null default 0 check (free_live_quiz_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  status text not null default 'pending' check (status in ('pending','success','failed')),
  payment_method text not null default 'paystack',
  reference text unique,
  paystack_reference text unique,
  plan_id text not null default 'lifetime_access',
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_user_id_idx on public.profiles(user_id);
create index user_roles_user_id_idx on public.user_roles(user_id);
create index payments_user_created_idx on public.payments(user_id, created_at desc);

create or replace function private.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null or auth.uid() <> _user_id then false
    else exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = _role
    )
  end;
$$;

revoke all on function private.has_role(uuid, public.app_role) from public, anon;
grant execute on function private.has_role(uuid, public.app_role) to authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.payments enable row level security;

create policy profiles_select_own
  on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy profiles_update_own
  on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy user_roles_select_own
  on public.user_roles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy payments_select_own
  on public.payments for select to authenticated
  using ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select on public.profiles, public.user_roles, public.payments to authenticated;
grant update (full_name, preferred_subjects) on public.profiles to authenticated;
revoke insert, update, delete on public.user_roles from anon, authenticated;
revoke insert, update, delete on public.payments from anon, authenticated;
revoke insert, delete on public.profiles from anon, authenticated;
