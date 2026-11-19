create or replace function public.consume_cbt_trial(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if p_user_id is null then
    raise exception 'User is required' using errcode = '22023';
  end if;
  update public.profiles
  set trial_count = trial_count + 1
  where user_id = p_user_id
    and (is_subscribed = true or trial_count < 3)
  returning * into v_profile;
  if found then
    return jsonb_build_object('allowed', true, 'trial_count', v_profile.trial_count, 'is_subscribed', v_profile.is_subscribed);
  end if;
  select * into v_profile from public.profiles where user_id = p_user_id;
  if not found then raise exception 'Student profile not found' using errcode = 'P0002'; end if;
  return jsonb_build_object('allowed', false, 'trial_count', v_profile.trial_count, 'is_subscribed', v_profile.is_subscribed);
end;
$$;
revoke all on function public.consume_cbt_trial(uuid) from public, anon, authenticated;
grant execute on function public.consume_cbt_trial(uuid) to service_role;
