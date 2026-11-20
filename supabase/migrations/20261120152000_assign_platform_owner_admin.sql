-- Ensure the registered platform-owner account always receives full administrator access.
-- This is an idempotent assignment: it does not alter any other user's roles.
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users
where lower(email) = lower('weblinescbt@gmail.com')
on conflict (user_id, role) do nothing;
