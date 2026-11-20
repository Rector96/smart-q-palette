revoke all on public.profiles, public.user_roles, public.payments from anon, authenticated;
grant select on public.profiles, public.user_roles, public.payments to authenticated;
grant update (full_name, preferred_subjects) on public.profiles to authenticated;
