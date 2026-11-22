-- Move Smart Q Palette referral codes to unique five-digit numeric codes.
-- Existing referral attributions/rewards/wallets are deliberately preserved.
-- Old links are replaced because the platform has not launched to real customers.

do $$
declare
  v_count bigint;
begin
  select count(*) into v_count from public.referral_profiles;
  if v_count > 90000 then
    raise exception 'Five-digit referral code capacity exceeded: % profiles', v_count;
  end if;
end;
$$;

-- Assign every existing test/account profile a fresh, unique five-digit code.
-- Existing referral_attributions retain their referrer_user_id relationship.
with numbered as (
  select user_id, (9999 + row_number() over (order by created_at, user_id))::text as new_code
  from public.referral_profiles
)
update public.referral_profiles rp
set referral_code = numbered.new_code
from numbered
where numbered.user_id = rp.user_id;

alter table public.referral_profiles
  drop constraint if exists referral_profiles_code_five_digits;

alter table public.referral_profiles
  add constraint referral_profiles_code_five_digits
  check (referral_code ~ '^[0-9]{5}$');

-- New accounts receive a collision-checked five-digit code.
-- The unique constraint remains the final protection against duplicate codes.
create or replace function private.handle_referral_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_new_code text;
  v_referrer uuid;
begin
  v_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'referral_code', '')));

  loop
    v_new_code := (10000 + floor(random() * 90000)::integer)::text;
    begin
      insert into public.referral_profiles(user_id, referral_code, signup_full_name)
      values (
        new.id,
        v_new_code,
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), '')
      )
      on conflict (user_id) do nothing;

      if found or exists (
        select 1 from public.referral_profiles where user_id = new.id
      ) then
        exit;
      end if;
    exception when unique_violation then
      -- Another account already received this five-digit number; try again.
      continue;
    end;
  end loop;

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
