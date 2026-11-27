-- Only record referral signup analytics when the signup trigger created a real
-- attribution. Raw signup metadata alone is untrusted and may contain invalid,
-- self-referral, or deliberately fabricated codes.
create or replace function private.log_referral_signup_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_source text;
begin
  select a.referral_code
    into v_code
    from public.referral_attributions a
   where a.referred_user_id = new.id;

  if v_code is null then
    return new;
  end if;

  v_source := case
    when new.raw_user_meta_data ->> 'referral_source' = 'link' then 'link'
    else 'typed'
  end;

  insert into public.share_analytics_events(user_id, event_name, referral_code, source)
  values (new.id, 'signup_with_referral', v_code, v_source);

  return new;
end;
$$;

revoke all on function private.log_referral_signup_event() from public, anon, authenticated;

-- PostgreSQL runs same-timing triggers alphabetically by trigger name.
-- The attribution trigger "on_auth_user_referral_created" therefore runs before
-- "on_auth_user_referral_event", allowing this function to verify the attribution.
