-- Use five-character uppercase alphanumeric referral codes.
-- Reassign existing codes while preserving user IDs, attribution relationships,
-- rewards, wallet balances, payments, and withdrawals.

alter table public.referral_profiles
  drop constraint if exists referral_profiles_code_five_digits;

do $$
declare
  r record;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i integer;
begin
  for r in select user_id from public.referral_profiles order by created_at, user_id loop
    loop
      v_code := '';
      for i in 1..5 loop
        v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
      end loop;
      begin
        update public.referral_profiles
        set referral_code = v_code
        where user_id = r.user_id;
        exit;
      exception when unique_violation then
        -- A collision is harmless; generate another code.
        continue;
      end;
    end loop;
  end loop;
end;
$$;

-- Keep the human-readable code snapshot in existing attribution rows in sync.
update public.referral_attributions a
set referral_code = rp.referral_code
from public.referral_profiles rp
where rp.user_id = a.referrer_user_id;

alter table public.referral_profiles
  add constraint referral_profiles_code_alphanumeric_five
  check (referral_code ~ '^[A-HJ-NP-Z2-9]{5}$');

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
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i integer;
begin
  v_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'referral_code', '')));

  loop
    v_new_code := '';
    for i in 1..5 loop
      v_new_code := v_new_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
    end loop;

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