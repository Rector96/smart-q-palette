-- Preserve the name supplied at signup for withdrawal account-name checks.
-- This field is written only by the auth trigger / privileged migration, not by clients.
alter table public.referral_profiles
  add column if not exists signup_full_name text;

update public.referral_profiles rp
set signup_full_name = nullif(trim(u.raw_user_meta_data ->> 'full_name'), '')
from auth.users u
where u.id = rp.user_id
  and rp.signup_full_name is null;

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

  insert into public.referral_profiles(user_id, referral_code, signup_full_name)
  values (
    new.id,
    'SQP' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), '')
  )
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
