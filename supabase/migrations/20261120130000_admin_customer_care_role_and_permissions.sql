
create or replace function public.is_current_user_support_agent()
returns boolean
language sql
stable
security invoker
set search_path = public, private, pg_temp
as $$
  select coalesce(private.has_role((select auth.uid()), 'moderator'::public.app_role), false);
$$;
revoke all on function public.is_current_user_support_agent() from public, anon;
grant execute on function public.is_current_user_support_agent() to authenticated;

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
for select to authenticated
using (
  private.has_role((select auth.uid()), 'admin'::public.app_role)
  or private.has_role((select auth.uid()), 'moderator'::public.app_role)
);

drop policy if exists payments_select_admin on public.payments;
create policy payments_select_admin on public.payments
for select to authenticated
using (
  private.has_role((select auth.uid()), 'admin'::public.app_role)
  or private.has_role((select auth.uid()), 'moderator'::public.app_role)
);

drop policy if exists payments_insert_admin on public.payments;
create policy payments_insert_admin on public.payments
for insert to authenticated
with check (
  private.has_role((select auth.uid()), 'admin'::public.app_role)
  or private.has_role((select auth.uid()), 'moderator'::public.app_role)
);

create policy user_roles_select_admin on public.user_roles
for select to authenticated
using (private.has_role((select auth.uid()), 'admin'::public.app_role));

create or replace function public.admin_set_support_agent_role(
  _target_user_id uuid,
  _enabled boolean
)
returns void
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
begin
  if auth.uid() is null or not private.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Administrator access required';
  end if;
  if _target_user_id is null then raise exception 'Select a customer first'; end if;

  if _enabled then
    insert into public.user_roles (user_id, role)
    values (_target_user_id, 'moderator'::public.app_role)
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles
    where user_id = _target_user_id and role = 'moderator'::public.app_role;
  end if;

  insert into public.admin_audit_logs (actor_user_id, action, target_user_id, details)
  values (auth.uid(), case when _enabled then 'support_agent_granted' else 'support_agent_revoked' end,
    _target_user_id, jsonb_build_object('role', 'customer_care'));
end;
$$;
revoke all on function public.admin_set_support_agent_role(uuid, boolean) from public, anon;
grant execute on function public.admin_set_support_agent_role(uuid, boolean) to authenticated;

create or replace function public.admin_record_manual_payment(
  _target_user_id uuid,
  _amount numeric,
  _reference text,
  _note text,
  _plan_id text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_payment_id uuid;
  v_reference text := nullif(trim(_reference), '');
  v_note text := nullif(trim(_note), '');
begin
  if auth.uid() is null or not (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    or private.has_role(auth.uid(), 'moderator'::public.app_role)
  ) then
    raise exception 'Customer care access required';
  end if;
  if _target_user_id is null then raise exception 'Select a customer first'; end if;
  if _amount is null or _amount <= 0 then raise exception 'Enter a valid payment amount'; end if;
  if v_reference is null then raise exception 'Enter the bank transfer or receipt reference'; end if;
  if v_note is null then raise exception 'Add a short verification note'; end if;
  if not exists (select 1 from public.profiles where user_id = _target_user_id) then
    raise exception 'Customer account was not found';
  end if;

  insert into public.payments (user_id, amount, currency, status, payment_method, reference, plan_id, verified_at)
  values (_target_user_id, _amount, 'NGN', 'success', 'manual_bank_transfer', v_reference, _plan_id, now())
  returning id into v_payment_id;

  update public.profiles set is_subscribed = true, updated_at = now() where user_id = _target_user_id;

  insert into public.admin_audit_logs (actor_user_id, action, target_user_id, details)
  values (auth.uid(), 'manual_payment_verified', _target_user_id,
    jsonb_build_object('payment_id', v_payment_id, 'amount', _amount, 'currency', 'NGN',
      'reference', v_reference, 'note', v_note, 'plan_id', _plan_id));
  return v_payment_id;
end;
$$;
revoke all on function public.admin_record_manual_payment(uuid, numeric, text, text, text) from public, anon;
grant execute on function public.admin_record_manual_payment(uuid, numeric, text, text, text) to authenticated;
