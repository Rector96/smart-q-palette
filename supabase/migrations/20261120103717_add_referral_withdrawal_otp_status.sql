alter table public.referral_withdrawals
  drop constraint if exists referral_withdrawals_status_check;

alter table public.referral_withdrawals
  add constraint referral_withdrawals_status_check
  check (status = any (array['queued','otp','processing','success','failed','reversed']::text[]));