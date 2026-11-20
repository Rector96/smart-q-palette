
create or replace function private.record_manual_payment_impl(
  _target_user_id uuid,
  _amount numeric,
  _reference text,
  _note text,
  _plan_id text default null
)
returns uuid
language plpgsql
security definer
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

revoke all on function private.record_manual_payment_impl(uuid, numeric, text, text, text) from public, anon;
grant execute on function private.record_manual_payment_impl(uuid, numeric, text, text, text) to authenticated;

create or replace function public.admin_record_manual_payment(
  _target_user_id uuid,
  _amount numeric,
  _reference text,
  _note text,
  _plan_id text default null
)
returns uuid
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select private.record_manual_payment_impl(_target_user_id, _amount, _reference, _note, _plan_id);
$$;
revoke all on function public.admin_record_manual_payment(uuid, numeric, text, text, text) from public, anon;
grant execute on function public.admin_record_manual_payment(uuid, numeric, text, text, text) to authenticated;
