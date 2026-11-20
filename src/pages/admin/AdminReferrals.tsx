import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, RefreshCw, ShieldCheck, Loader2, Banknote, Clock3, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const [savingId, setSavingId] = useState("");
  const [otp, setOtp] = useState("");
  const [selectedId, setSelectedId] = useState("");

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

  const approveTransfer = async (withdrawalId: string) => {
    if (!/^\d{4,8}$/.test(otp.trim())) {
      toast({ title: "Enter the Paystack code", description: "Use the authorisation code sent to the platform's registered Paystack contact.", variant: "destructive" });
      return;
    }
    setSavingId(withdrawalId);
    const { data, error } = await supabase.functions.invoke("referral-admin", {
      body: { action: "finalize_otp", withdrawal_id: withdrawalId, otp: otp.trim() },
    });
    setSavingId("");
    if (error || !data?.finalized) {
      let message = data?.error || error?.message || "Paystack could not approve this transfer.";
      const context = (error as any)?.context;
      if (context && typeof context.clone === "function") {
        try { const body = await context.clone().json(); message = body?.error || body?.message || message; } catch { /* keep safe fallback */ }
      }
      toast({ title: "Transfer not approved", description: message, variant: "destructive" });
      await loadWithdrawals();
      return;
    }
    setOtp("");
    setSelectedId("");
    toast({ title: "Transfer authorised", description: "Paystack has accepted the code. The payout is processing and the customer will be updated after confirmation." });
    await loadWithdrawals();
  };

  const statusLabel = (status: string) => status === "otp" ? "Awaiting OTP approval" : status === "processing" ? "Processing" : status;
  const pendingOtpCount = withdrawals.filter((item) => item.status === "otp").length;

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
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Awaiting your Paystack code</p><p className="mt-1 text-2xl font-bold">{pendingOtpCount}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Open referral payouts</p><p className="mt-1 text-2xl font-bold">{withdrawals.length}</p></CardContent></Card>
        </section>
        <Card className="border-primary/20 bg-primary/[0.03]"><CardContent className="flex items-start gap-3 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="text-sm font-semibold">Administrator-only approval</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Paystack sends the transfer code to the business contact registered on the Paystack account. Enter that code here. Customers never need to see or enter this code. Never share it with a customer or anyone outside the authorised admin team.</p></div></CardContent></Card>

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
                    <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                      <div className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-4 w-4 text-amber-600" /> Paystack is waiting for your authorisation</div>
                      <p className="text-xs leading-5 text-muted-foreground">Enter the OTP sent to the platform's registered Paystack phone/email. This approves the transfer for the customer shown above.</p>
                      {selectedId === item.id ? (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="Enter Paystack OTP" className="sm:max-w-xs" />
                          <Button onClick={() => void approveTransfer(item.id)} disabled={savingId === item.id || otp.length < 4}>{savingId === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Approve transfer</Button>
                          <Button variant="ghost" onClick={() => { setSelectedId(""); setOtp(""); }}>Cancel</Button>
                        </div>
                      ) : <Button onClick={() => { setSelectedId(item.id); setOtp(""); }}>Enter Paystack code</Button>}
                    </div>
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
