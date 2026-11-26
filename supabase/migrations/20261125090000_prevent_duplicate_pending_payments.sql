-- Store the Paystack checkout URL so retries can reuse an existing payment.
alter table public.payments
add column if not exists paystack_authorization_url text;

-- Prevent duplicate pending Paystack payments for the same customer and plan.
create unique index if not exists payments_one_pending_paystack_per_user_plan
on public.payments (user_id, plan_id)
where status = 'pending'
  and payment_method = 'paystack';