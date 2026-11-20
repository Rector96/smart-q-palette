create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security invoker
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
    set is_subscribed = _is_subscribed
    where user_id = _target_user_id;
  if not found then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.admin_set_user_subscription(uuid, boolean) from public, anon;
grant execute on function public.admin_set_user_subscription(uuid, boolean) to authenticated;

create or replace function public.admin_reset_user_trials(_target_user_id uuid)
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
  if _target_user_id is null then
    raise exception 'A target user is required' using errcode = '22004';
  end if;

  update public.profiles
    set trial_count = 0
    where user_id = _target_user_id;
  if not found then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.admin_reset_user_trials(uuid) from public, anon;
grant execute on function public.admin_reset_user_trials(uuid) to authenticated;

grant update (is_subscribed, trial_count) on public.profiles to authenticated;
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin
  on public.profiles for update to authenticated
  using (private.has_role((select auth.uid()), 'admin'::public.app_role))
  with check (private.has_role((select auth.uid()), 'admin'::public.app_role));

alter table public.admin_audit_logs alter column actor_user_id drop not null;

create or replace function private.guard_profile_privileged_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.is_subscribed is distinct from old.is_subscribed
      or new.trial_count is distinct from old.trial_count) then
    if auth.uid() is null then
      if current_user not in ('service_role', 'postgres') then
        raise exception 'Only an administrator or trusted server may change subscription and trial fields'
          using errcode = '42501';
      end if;
    elsif not private.has_role(auth.uid(), 'admin'::public.app_role) then
      raise exception 'Administrator access required to change subscription and trial fields'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_profile_privileged_fields() from public, anon, authenticated;

drop trigger if exists profiles_guard_privileged_fields on public.profiles;
create trigger profiles_guard_privileged_fields
  before update of is_subscribed, trial_count on public.profiles
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
  if new.is_subscribed is distinct from old.is_subscribed then
    insert into public.admin_audit_logs (actor_user_id, action, target_user_id, details)
    values (
      actor,
      'user.subscription_changed',
      new.user_id,
      jsonb_build_object(
        'old_value', old.is_subscribed,
        'new_value', new.is_subscribed,
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
  after update of is_subscribed, trial_count on public.profiles
  for each row execute function private.audit_profile_privileged_changes();
