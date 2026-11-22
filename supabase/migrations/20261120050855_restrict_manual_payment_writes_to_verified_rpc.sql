
drop policy if exists payments_insert_admin on public.payments;
revoke insert on public.payments from authenticated;
