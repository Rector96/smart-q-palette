do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'referral_wallets'
  ) then
    alter publication supabase_realtime add table public.referral_wallets;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'referral_rewards'
  ) then
    alter publication supabase_realtime add table public.referral_rewards;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'referral_wallet_transactions'
  ) then
    alter publication supabase_realtime add table public.referral_wallet_transactions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'referral_withdrawals'
  ) then
    alter publication supabase_realtime add table public.referral_withdrawals;
  end if;
end $$;