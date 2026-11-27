-- Prevent clients from fabricating referral-signup analytics events.
-- Signup events are written only by the auth.users trigger. Client-generated
-- referral analytics may reference only the signed-in user's own referral code.

drop policy if exists share_analytics_events_insert_own
  on public.share_analytics_events;

create policy share_analytics_events_insert_own
  on public.share_analytics_events
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and event_name <> 'signup_with_referral'
    and (
      referral_code is null
      or exists (
        select 1
        from public.referral_profiles rp
        where rp.user_id = (select auth.uid())
          and upper(rp.referral_code) = upper(share_analytics_events.referral_code)
      )
    )
  );
