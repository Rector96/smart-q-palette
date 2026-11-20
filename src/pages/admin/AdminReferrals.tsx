import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, RefreshCw, ShieldCheck, Loader2, Banknote } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type CustomerControl = { user_id: string; full_name: string | null; email: string | null; withdrawals_blocked: boolean; withdrawals_block_reason: string | null; has_referral_profile: boolean };

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
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
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

  useEffect(() => { void loadWithdrawals(); }, [loadWithdrawals]);


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
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => void loadWithdrawals()} disabled={loading}><RefreshCw className={"mr-2 h-3.5 w-3.5 " + (loading ? "animate-spin" : "")} />Refresh</Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-5 sm:px-6 sm:py-7">
        <section className="grid gap-3 sm:grid-cols-2">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Legacy OTP requests to review</p><p className="mt-1 text-2xl font-bold">{legacyOtpCount}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Open referral payouts</p><p className="mt-1 text-2xl font-bold">{withdrawals.length}</p></CardContent></Card>
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
