create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('user.subscription_changed','user.trials_reset')),
  target_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);
create index if not exists admin_audit_logs_target_user_idx
  on public.admin_audit_logs (target_user_id, created_at desc);

alter table public.admin_audit_logs enable row level security;
revoke all on public.admin_audit_logs from anon, authenticated;
grant select on public.admin_audit_logs to authenticated;
drop policy if exists admin_audit_logs_select_admin on public.admin_audit_logs;
create policy admin_audit_logs_select_admin
  on public.admin_audit_logs for select to authenticated
  using (private.has_role((select auth.uid()), 'admin'::public.app_role));

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin
  on public.profiles for select to authenticated
  using (private.has_role((select auth.uid()), 'admin'::public.app_role));

drop policy if exists payments_select_admin on public.payments;
create policy payments_select_admin
  on public.payments for select to authenticated
  using (private.has_role((select auth.uid()), 'admin'::public.app_role));

drop policy if exists exam_sessions_select_admin on public.exam_sessions;
create policy exam_sessions_select_admin
  on public.exam_sessions for select to authenticated
  using (private.has_role((select auth.uid()), 'admin'::public.app_role));

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.has_role((select auth.uid()), 'admin'::public.app_role),
    false
  );
$$;
revoke all on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to authenticated;

create or replace function public.admin_set_user_subscription(
  _target_user_id uuid,
  _is_subscribed boolean
)
returns void
language plpgsql
security definer
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
    set is_subscribed = _is_subscribed
    where user_id = _target_user_id;
  if not found then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;

  insert into public.admin_audit_logs (actor_user_id, action, target_user_id, details)
  values (
    auth.uid(),
    'user.subscription_changed',
    _target_user_id,
    jsonb_build_object('is_subscribed', _is_subscribed)
  );
end;
$$;
revoke all on function public.admin_set_user_subscription(uuid, boolean) from public, anon;
grant execute on function public.admin_set_user_subscription(uuid, boolean) to authenticated;

create or replace function public.admin_reset_user_trials(_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not private.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if _target_user_id is null then
    raise exception 'A target user is required' using errcode = '22004';
  end if;

  update public.profiles
    set trial_count = 0
    where user_id = _target_user_id;
  if not found then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;

  insert into public.admin_audit_logs (actor_user_id, action, target_user_id, details)
  values (auth.uid(), 'user.trials_reset', _target_user_id, jsonb_build_object('trial_count', 0));
end;
$$;
revoke all on function public.admin_reset_user_trials(uuid) from public, anon;
grant execute on function public.admin_reset_user_trials(uuid) to authenticated;
