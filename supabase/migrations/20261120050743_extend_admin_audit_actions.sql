
alter table public.admin_audit_logs drop constraint if exists admin_audit_logs_action_check;
alter table public.admin_audit_logs
add constraint admin_audit_logs_action_check
check (action = any (array[
  'user.subscription_changed',
  'user.trials_reset',
  'manual_payment_verified',
  'support_agent_granted',
  'support_agent_revoked'
]::text[]));
