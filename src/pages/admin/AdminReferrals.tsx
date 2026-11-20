import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, RefreshCw, ShieldCheck, Loader2, Banknote, Activity, Users, Wallet, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type CustomerControl = { user_id: string; full_name: string | null; email: string | null; withdrawals_blocked: boolean; withdrawals_block_reason: string | null; has_referral_profile: boolean };

type AdminWallet = { user_id: string; customer_name: string; customer_email: string; available_balance: number; pending_balance: number; lifetime_earned: number; lifetime_paid: number; recovery_balance: number; updated_at: string; is_subscribed: boolean; referral_code: string | null; withdrawals_blocked: boolean; withdrawals_block_reason: string | null };
type AdminTransaction = { id: string; user_id: string; customer_name: string; customer_email: string; transaction_type: string; amount: number; status: string; description: string | null; created_at: string };
type AdminOverview = { rewards: any[]; withdrawals: any[]; summary: { users: number; available_balance: number; pending_balance: number; lifetime_earned: number; lifetime_paid: number; recovery_balance: number; rewards: number; withdrawals: number }; wallets: AdminWallet[]; transactions: AdminTransaction[]; rewards: any[]; withdrawals: any[] };

type Withdrawal = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  reference: string;
  requested_at: string;
  customer_name: string;
  customer_email: string;
  bank?: { bank_name?: string; account_name?: string; account_number_masked?: string } | null;
};

const money = (value: number) => new Intl.NumberFormat("en-NG", {
  style: "currency", currency: "NGN", maximumFractionDigits: 0,
}).format(Number(value) || 0);

const AdminReferrals = () => {
  const { toast } = useToast();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);\n  const [overview, setOverview] = useState<AdminOverview | null>(null);\n  const [overviewLoading, setOverviewLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerControl[]>([]);
  const [customerSearchBusy, setCustomerSearchBusy] = useState(false);
  const [customerActionId, setCustomerActionId] = useState("");
  const [blockReasons, setBlockReasons] = useState<Record<string, string>>({});

  const loadWithdrawals = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("referral-admin", { body: { action: "list" } });
    setLoading(false);
    if (error || !data?.withdrawals) {
      let message = data?.error || error?.message || "Could not load referral payouts.";
      const context = (error as any)?.context;
      if (context && typeof context.clone === "function") {
        try { const body = await context.clone().json(); message = body?.error || body?.message || message; } catch { /* keep safe fallback */ }
      }
      toast({ title: "Referral payouts unavailable", description: message, variant: "destructive" });
      return;
    }
    setWithdrawals(data.withdrawals as Withdrawal[]);
  }, [toast]);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    const { data, error } = await supabase.functions.invoke("referral-admin", { body: { action: "overview" } });
    setOverviewLoading(false);
    if (error || !data?.summary || !Array.isArray(data.wallets)) {
      toast({ title: "Financial overview unavailable", description: data?.error || error?.message || "Could not load wallet activity.", variant: "destructive" });
      return;
    }
    setOverview(data as AdminOverview);
  }, [toast]);

  useEffect(() => { void loadWithdrawals(); void loadOverview(); }, [loadWithdrawals, loadOverview]);

  useEffect(() => {
    const channel = supabase.channel("admin-referral-financial-activity")
      .on("postgres_changes", { event: "*", schema: "public", table: "referral_wallets" }, () => { void loadOverview(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "referral_wallet_transactions" }, () => { void loadOverview(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "referral_rewards" }, () => { void loadOverview(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "referral_withdrawals" }, () => { void loadOverview(); void loadWithdrawals(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadOverview, loadWithdrawals]);


  const searchCustomers = async () => {
    if (customerQuery.trim().length < 3) {
      toast({ title: "Enter more details", description: "Search by at least 3 letters of the customer's name or email.", variant: "destructive" });
      return;
    }
    setCustomerSearchBusy(true);
    setCustomers([]); // Do not leave previous search results visible under a new query.
    const { data, error } = await supabase.functions.invoke("referral-admin", {
      body: { action: "find_customer", query: customerQuery.trim() },
    });
    setCustomerSearchBusy(false);
    if (error || !data?.customers) {
      toast({ title: "Customer search failed", description: data?.error || error?.message || "Please try again.", variant: "destructive" });
      return;
    }
    setCustomers(data.customers as CustomerControl[]);
  };

  const setCustomerWithdrawalBlock = async (customer: CustomerControl, blocked: boolean) => {
    const blockReason = blockReasons[customer.user_id] ?? "";
    if (blocked && blockReason.trim().length < 5) {
      toast({ title: "Reason required", description: "Enter a clear reason before blocking this customer's withdrawals.", variant: "destructive" });
      return;
    }
    setCustomerActionId(customer.user_id);
    const { data, error } = await supabase.functions.invoke("referral-admin", {
      body: { action: "set_withdrawal_block", user_id: customer.user_id, blocked, reason: blockReason.trim() },
    });
    setCustomerActionId("");
    if (error || !data?.updated) {
      toast({ title: "Could not update withdrawal access", description: data?.error || error?.message || "Please try again.", variant: "destructive" });
      return;
    }
    setCustomers((current) => current.map((item) => item.user_id === customer.user_id
      ? { ...item, withdrawals_blocked: blocked, withdrawals_block_reason: blocked ? blockReason.trim() : null }
      : item));
    setBlockReasons((current) => ({ ...current, [customer.user_id]: "" }));
    toast({ title: blocked ? "Withdrawals blocked" : "Withdrawals restored", description: data.message });
  };

  const statusLabel = (status: string) => status === "otp" ? "Legacy OTP — needs review" : status === "processing" ? "Processing" : status;
  const legacyOtpCount = withdrawals.filter((item) => item.status === "otp").length;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/admin" className="rounded-lg p-2 hover:bg-muted"><ArrowLeft className="h-4 w-4" /></Link>
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><Banknote className="h-4 w-4" /></div>
          <div className="min-w-0"><h1 className="text-sm font-bold">Referral payouts</h1><p className="text-[11px] text-muted-foreground">Review and authorise Paystack withdrawals</p></div>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => { void loadWithdrawals(); void loadOverview(); }} disabled={loading || overviewLoading}><RefreshCw className={"mr-2 h-3.5 w-3.5 " + (loading ? "animate-spin" : "")} />Refresh</Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6 sm:py-7">
        <section className="grid gap-3 sm:grid-cols-2">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Legacy OTP requests to review</p><p className="mt-1 text-2xl font-bold">{legacyOtpCount}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Open referral payouts</p><p className="mt-1 text-2xl font-bold">{withdrawals.length}</p></CardContent></Card>
        </section>

        <section className="space-y-3">
          <div><h2 className="flex items-center gap-2 text-base font-bold"><Activity className="h-4 w-4" />Financial control centre</h2><p className="text-xs text-muted-foreground">Live wallet positions and the referral money trail. Amounts are in naira; refresh or use the activity stream to monitor changes.</p></div>
          {overviewLoading && !overview ? <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading financial records…</div> : overview ? <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Card><CardContent className="p-4"><p className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5"/>Wallet customers</p><p className="mt-1 text-2xl font-bold tabular-nums">{overview.summary.users}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="flex items-center gap-1 text-xs text-muted-foreground"><Wallet className="h-3.5 w-3.5"/>Available wallet funds</p><p className="mt-1 text-xl font-bold tabular-nums">{money(overview.summary.available_balance)}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="flex items-center gap-1 text-xs text-muted-foreground">Pending rewards</p><p className="mt-1 text-xl font-bold tabular-nums">{money(overview.summary.pending_balance)}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="flex items-center gap-1 text-xs text-muted-foreground"><TrendingUp className="h-3.5 w-3.5"/>Lifetime paid out</p><p className="mt-1 text-xl font-bold tabular-nums">{money(overview.summary.lifetime_paid)}</p></CardContent></Card>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total rewards earned</p><p className="mt-1 text-lg font-bold">{money(overview.summary.lifetime_earned)}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Open recovery balances</p><p className="mt-1 text-lg font-bold">{money(overview.summary.recovery_balance)}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Recorded referral rewards</p><p className="mt-1 text-lg font-bold">{overview.summary.rewards}</p></CardContent></Card>
            </div>
            <Card><CardContent className="space-y-3 p-4">
              <div><h3 className="font-bold">All customer wallets</h3><p className="text-xs text-muted-foreground">Up to 500 most recently updated wallets. Blocked accounts retain their balances.</p></div>
              <div className="max-h-[440px] overflow-auto rounded-lg border">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="sticky top-0 bg-muted"><tr><th className="p-3">Customer</th><th className="p-3">Available</th><th className="p-3">Pending</th><th className="p-3">Earned</th><th className="p-3">Paid</th><th className="p-3">Account</th></tr></thead>
                  <tbody>{overview.wallets.map((wallet) => <tr key={wallet.user_id} className="border-t">
                    <td className="p-3"><p className="font-semibold">{wallet.customer_name}</p><p className="text-muted-foreground">{wallet.customer_email}</p></td>
                    <td className="p-3 font-semibold tabular-nums">{money(wallet.available_balance)}</td><td className="p-3 tabular-nums">{money(wallet.pending_balance)}</td><td className="p-3 tabular-nums">{money(wallet.lifetime_earned)}</td><td className="p-3 tabular-nums">{money(wallet.lifetime_paid)}</td>
                    <td className="p-3"><Badge variant={wallet.withdrawals_blocked ? "destructive" : wallet.is_subscribed ? "default" : "secondary"}>{wallet.withdrawals_blocked ? "Blocked" : wallet.is_subscribed ? "Subscribed" : "Not subscribed"}</Badge></td>
                  </tr>)}</tbody>
                </table>
                {overview.wallets.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No referral wallets have been created yet.</p>}
              </div>
            </CardContent></Card>
            <Card><CardContent className="space-y-3 p-4">
              <div><h3 className="font-bold">Latest wallet activity</h3><p className="text-xs text-muted-foreground">Credits, reservations, reversals and payout ledger entries.</p></div>
              <div className="space-y-2">{overview.transactions.slice(0, 100).map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0">
                <div className="min-w-0"><p className="text-sm font-semibold">{item.customer_name} <span className="font-normal text-muted-foreground">· {item.transaction_type.replace(/_/g, " ")}</span></p><p className="text-xs text-muted-foreground">{item.description || item.customer_email} · {new Date(item.created_at).toLocaleString()}</p></div>
                <div className="text-right"><p className="text-sm font-bold tabular-nums">{money(item.amount)}</p><Badge variant={item.status === "posted" ? "secondary" : "outline"}>{item.status}</Badge></div>
              </div>)}
              {overview.transactions.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No wallet transactions recorded yet.</p>}</div>
            </CardContent></Card>
            <Card><CardContent className="space-y-3 p-4">
              <div><h3 className="font-bold">Confirmed referral subscriptions</h3><p className="text-xs text-muted-foreground">Each row represents a reward record created after a qualifying payment was confirmed. The reward is fixed at ₦500.</p></div>
              <div className="max-h-[320px] space-y-2 overflow-auto">{overview.rewards.slice(0, 100).map((reward) => <div key={reward.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0">
                <div><p className="text-sm font-semibold">{reward.referrer_name} <span className="font-normal text-muted-foreground">referred</span> {reward.referred_name}</p><p className="text-xs text-muted-foreground">{reward.referrer_email} · Payment {reward.payment_reference || "—"} · Subscription {money(reward.payment_amount)} · {new Date(reward.created_at).toLocaleString()}</p></div>
                <div className="text-right"><p className="text-sm font-bold">{money(reward.amount)}</p><Badge variant={reward.status === "available" ? "default" : "secondary"}>{reward.status}</Badge></div>
              </div>)}{overview.rewards.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No qualifying referral subscriptions recorded yet.</p>}</div>
            </CardContent></Card>
            <Card><CardContent className="space-y-3 p-4">
              <div><h3 className="font-bold">All payout records</h3><p className="text-xs text-muted-foreground">Includes processing, successful, failed and reversed withdrawals.</p></div>
              <div className="max-h-[320px] space-y-2 overflow-auto">{overview.withdrawals.slice(0, 100).map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0">
                <div><p className="text-sm font-semibold">{item.customer_name} · {money(item.amount)}</p><p className="text-xs text-muted-foreground">{item.reference} · {new Date(item.requested_at).toLocaleString()}</p></div>
                <Badge variant={item.status === "success" ? "default" : item.status === "failed" || item.status === "reversed" ? "destructive" : "secondary"}>{item.status}</Badge>
              </div>)}{overview.withdrawals.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No payout records yet.</p>}</div>
            </CardContent></Card>
          </> : <p className="text-sm text-muted-foreground">Financial records could not be loaded.</p>}
        </section>

        <Card><CardContent className="space-y-3 p-4 sm:p-5">
          <div><h2 className="text-base font-bold">Customer withdrawal controls</h2><p className="text-xs text-muted-foreground">Search for a customer to temporarily block or restore withdrawals. Blocking never removes their earned wallet balance.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder="Search customer name or email" className="min-w-0 flex-1" />
            <Button variant="outline" onClick={() => void searchCustomers()} disabled={customerSearchBusy}>{customerSearchBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Search customer</Button>
          </div>
          {customers.map((customer) => (
            <div key={customer.user_id} className="space-y-3 rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0"><p className="text-sm font-semibold">{customer.full_name || "Customer"}</p><p className="break-all text-xs text-muted-foreground">{customer.email || customer.user_id}</p></div>
                <Badge variant={customer.withdrawals_blocked ? "destructive" : "secondary"}>{customer.withdrawals_blocked ? "Withdrawals blocked" : "Withdrawals allowed"}</Badge>
              </div>
              {customer.withdrawals_blocked && customer.withdrawals_block_reason ? <p className="text-xs text-muted-foreground">Reason: {customer.withdrawals_block_reason}</p> : null}
              {!customer.has_referral_profile ? <p className="text-xs text-muted-foreground">This account has no referral wallet profile to control.</p> : customer.withdrawals_blocked ? (
                <Button size="sm" variant="outline" onClick={() => void setCustomerWithdrawalBlock(customer, false)} disabled={customerActionId === customer.user_id}>{customerActionId === customer.user_id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Restore withdrawals</Button>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input value={blockReasons[customer.user_id] ?? ""} onChange={(event) => setBlockReasons((current) => ({ ...current, [customer.user_id]: event.target.value }))} placeholder="Reason for temporary block" maxLength={500} className="min-w-0 flex-1" />
                  <Button size="sm" variant="destructive" onClick={() => void setCustomerWithdrawalBlock(customer, true)} disabled={customerActionId === customer.user_id}>{customerActionId === customer.user_id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Block withdrawals</Button>
                </div>
              )}
            </div>
          ))}
          {customers.length === 0 && customerQuery.trim().length >= 3 && !customerSearchBusy ? <p className="text-xs text-muted-foreground">No matching customers found. Try another name or email.</p> : null}
        </CardContent></Card>

        <Card className="border-primary/20 bg-primary/[0.03]"><CardContent className="flex items-start gap-3 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="text-sm font-semibold">Automatic payout monitoring</p><p className="mt-1 text-xs leading-5 text-muted-foreground">New withdrawals are sent to Paystack automatically. The system marks them paid only after Paystack confirms success. Legacy OTP requests are shown for review and are not approved from this page.</p></div></CardContent></Card>

        <section className="space-y-3">
          <div><h2 className="text-base font-bold">Withdrawal requests</h2><p className="text-xs text-muted-foreground">A customer's wallet amount is reserved while Paystack processes the transfer. It is counted as paid only after Paystack confirms success.</p></div>
          {loading ? <div className="flex items-center justify-center py-12 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading withdrawals…</div> :
            withdrawals.length === 0 ? <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No open referral withdrawals.</CardContent></Card> :
            withdrawals.map((item) => (
              <Card key={item.id} className="overflow-hidden">
                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="text-xl font-bold">{money(item.amount)}</p><p className="mt-1 text-xs font-medium">{item.customer_name}</p><p className="text-xs text-muted-foreground">{item.customer_email}</p></div>
                    <Badge variant={item.status === "otp" ? "default" : "secondary"} className="capitalize">{statusLabel(item.status)}</Badge>
                  </div>
                  <div className="grid gap-3 rounded-xl bg-muted/40 p-3 text-xs sm:grid-cols-2">
                    <div><p className="text-muted-foreground">Bank account name</p><p className="mt-1 font-semibold">{item.bank?.account_name || "—"}</p></div>
                    <div><p className="text-muted-foreground">Destination</p><p className="mt-1 font-semibold">{item.bank?.bank_name || "—"} · {item.bank?.account_number_masked || "—"}</p></div>
                    <div><p className="text-muted-foreground">Requested</p><p className="mt-1 font-medium">{new Date(item.requested_at).toLocaleString()}</p></div>
                    <div><p className="text-muted-foreground">Reference</p><p className="mt-1 break-all font-mono text-[10px]">{item.reference}</p></div>
                  </div>
                  {item.status === "otp" ? (
                    <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-muted-foreground">This is a legacy request created while Paystack OTP approval was enabled. Do not approve it here. Check its status in Paystack before taking any manual action.</p>
                  ) : <p className="text-xs text-muted-foreground">No action is required. Wait for Paystack to confirm the transfer. Refresh to check the latest status.</p>}
                </CardContent>
              </Card>
            ))}
        </section>
      </main>
    </div>
  );
};

export default AdminReferrals;
