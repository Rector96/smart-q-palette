-- Protect every profile field that represents paid access or metered usage.
-- Ordinary users may edit their own profile identity/preferences, but must not
-- grant themselves subscription access or reset/inflate usage allowances.
create or replace function private.guard_profile_privileged_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    new.is_subscribed is distinct from old.is_subscribed
    or new.trial_count is distinct from old.trial_count
    or new.ai_tutor_usage is distinct from old.ai_tutor_usage
    or new.ai_builder_usage is distinct from old.ai_builder_usage
    or new.free_live_quiz_used is distinct from old.free_live_quiz_used
  ) then
    if auth.uid() is null then
      if current_user not in ('service_role', 'postgres') then
        raise exception 'Only an administrator or trusted server may change subscription and usage fields'
          using errcode = '42501';
      end if;
    elsif not private.has_role(auth.uid(), 'admin'::public.app_role) then
      raise exception 'Administrator access required to change subscription and usage fields'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged_fields on public.profiles;
create trigger profiles_guard_privileged_fields
  before update of is_subscribed, trial_count, ai_tutor_usage, ai_builder_usage, free_live_quiz_used
  on public.profiles
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
    values (actor, 'user.subscription_changed', new.user_id,
      jsonb_build_object('old_value', old.is_subscribed, 'new_value', new.is_subscribed, 'source', source_label));
  end if;

  if new.trial_count is distinct from old.trial_count then
    insert into public.admin_audit_logs (actor_user_id, action, target_user_id, details)
    values (actor, 'user.trials_reset', new.user_id,
      jsonb_build_object('old_value', old.trial_count, 'new_value', new.trial_count, 'source', source_label));
  end if;

  if new.ai_tutor_usage is distinct from old.ai_tutor_usage
     or new.ai_builder_usage is distinct from old.ai_builder_usage
     or new.free_live_quiz_used is distinct from old.free_live_quiz_used then
    insert into public.admin_audit_logs (actor_user_id, action, target_user_id, details)
    values (actor, 'user.usage_counter_changed', new.user_id,
      jsonb_build_object(
        'old_ai_tutor_usage', old.ai_tutor_usage, 'new_ai_tutor_usage', new.ai_tutor_usage,
        'old_ai_builder_usage', old.ai_builder_usage, 'new_ai_builder_usage', new.ai_builder_usage,
        'old_free_live_quiz_used', old.free_live_quiz_used, 'new_free_live_quiz_used', new.free_live_quiz_used,
        'source', source_label
      ));
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_audit_privileged_changes on public.profiles;
create trigger profiles_audit_privileged_changes
  after update of is_subscribed, trial_count, ai_tutor_usage, ai_builder_usage, free_live_quiz_used
  on public.profiles
  for each row execute function private.audit_profile_privileged_changes();
