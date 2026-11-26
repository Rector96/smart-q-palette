import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Bell, CheckCheck, CreditCard, Gift, Wallet, ExternalLink, RefreshCw, Share2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import DesktopHeader from "@/components/DesktopHeader";
import logoImg from "@/assets/logo.png";
import { shareTransactionReceipt } from "@/lib/transactionReceipt";
import { useToast } from "@/hooks/use-toast";

type Activity = {
  id: string; title: string; description: string; amount: number; status: string;
  date: string; reference: string; kind: "payment" | "reward" | "withdrawal";
  detail: string; href: string;
};
const money = (amount: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(amount) || 0);
const readKey = (id: string) => `sqp-notifications-read-${id}`;
const storedReadIds = (key: string): string[] => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(stored) && stored.every((id): id is string => typeof id === "string") ? stored : [];
  } catch {
    return [];
  }
};

const Notifications = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const initialReadMarked = useRef(false);
  const storageKey = user ? readKey(user.id) : "";
  const shareReceipt = async (item: Activity) => {
    try {
      const result = await shareTransactionReceipt({
        brand: "ROCKCBT",
        type: item.kind === "payment" ? "Subscription payment" : item.kind === "reward" ? "Referral earnings" : "Referral withdrawal",
        amount: item.amount,
        status: item.status,
        date: item.date,
        reference: item.reference,
        description: item.description + " · " + item.detail,
        logoSrc: logoImg,
      });
      if (result === "downloaded") toast({ title: "Receipt image ready", description: "Your ROCKCBT receipt has been downloaded and is ready to share." });
    } catch (error) {
      if ((error as Error).name !== "AbortError") toast({ title: "Could not share receipt", description: (error as Error).message || "Please try again.", variant: "destructive" });
    }
  };

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError("");
    const [payments, rewards, withdrawals] = await Promise.all([
      supabase.from("payments").select("id,amount,refunded_amount_kobo,status,reference,payment_method,created_at,updated_at,verified_at,plan_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
      supabase.from("referral_rewards").select("id,amount,status,payment_id,created_at,available_at,reversed_at").eq("referrer_user_id", user.id).order("created_at", { ascending: false }).limit(100),
      supabase.from("referral_withdrawals").select("id,amount,status,reference,requested_at,completed_at,failure_reason,bank_account_id").eq("user_id", user.id).order("requested_at", { ascending: false }).limit(100),
    ]);
    const failed = [payments, rewards, withdrawals].find((x) => x.error);
    if (failed) { setError(failed.error.message || "We could not load your account history."); setActivities([]); setLoading(false); return; }
    const rows: Activity[] = [];
    (payments.data || []).forEach((r) => {
      const grossAmount = Number(r.amount);
      const refundAmount = Number(r.refunded_amount_kobo || 0) / 100;
      const netAmount = grossAmount - refundAmount;
      const fullyRefunded = r.status === "refunded";
      const partiallyRefunded = r.status === "success" && refundAmount > 0;
      rows.push({
        id: `payment-${r.id}`,
        title: fullyRefunded
          ? "Subscription payment refunded"
          : partiallyRefunded
          ? "Subscription payment partially refunded"
          : r.status === "success"
          ? "Subscription payment successful"
          : r.status === "failed"
          ? "Subscription payment failed"
          : "Subscription payment pending",
        description: `${money(grossAmount)} gross · ${money(refundAmount)} refunded · ${money(netAmount)} net · ${r.payment_method || "Payment"} · ${r.plan_id || "Subscription"}`,
        amount: grossAmount, status: partiallyRefunded ? "partial_refund" : String(r.status),
        date: r.verified_at || r.updated_at || r.created_at,
        reference: r.reference || r.id, kind: "payment",
        detail: fullyRefunded
          ? "The full payment was refunded. Access remains active only if another valid payment or administrator entitlement applies."
          : partiallyRefunded
          ? "A partial refund was recorded. The displayed net amount is the original payment less recorded refunds."
          : r.status === "success"
          ? "Your subscription payment has been confirmed and recorded on your account."
          : r.status === "failed"
          ? "This payment was not completed. If money was deducted, contact support with the reference below."
          : "This payment is awaiting confirmation.",
        href: `/notifications#payment-${r.id}`,
      });
    });
    (rewards.data || []).forEach((r) => rows.push({
      id: `reward-${r.id}`, title: r.status === "reversed" ? "Referral reward reversed" : "Referral reward earned",
      description: `Referral commission · ${money(Number(r.amount))}`,
      amount: Number(r.amount), status: String(r.status), date: r.reversed_at || r.available_at || r.created_at,
      reference: r.payment_id || r.id, kind: "reward",
      detail: r.status === "reversed" ? "This reward was reversed following a payment reversal or refund." : "This reward is linked to a successful subscription made through your referral link.",
      href: "/referrals#rewards-history",
    }));
    (withdrawals.data || []).forEach((r) => rows.push({
      id: `withdrawal-${r.id}`, title: r.status === "success" ? "Withdrawal paid" : ["failed", "reversed"].includes(r.status) ? "Withdrawal not completed" : "Withdrawal request update",
      description: `Bank payout · ${money(Number(r.amount))}`,
      amount: Number(r.amount), status: String(r.status), date: r.completed_at || r.requested_at,
      reference: r.reference || r.id, kind: "withdrawal",
      detail: r.status === "success" ? "The payout was marked successful by the payment provider." : r.status === "failed" || r.status === "reversed" ? `The payout did not complete. ${r.failure_reason || "The available balance is restored according to the withdrawal process."}` : "Your withdrawal request has been received and is being processed.",
      href: "/referrals#withdrawal-history",
    }));
    rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    // Opening the activity page marks everything already present as read.
    // Future realtime arrivals remain unread and can show the badge again.
    if (!initialReadMarked.current) {
      const existingReadIds = (() => {
        try { return storedReadIds(storageKey); }
        catch { return []; }
      })();
      const nextReadIds = Array.from(new Set([...existingReadIds, ...rows.map((row) => row.id)])).slice(-300);
      setReadIds(nextReadIds);
      try { localStorage.setItem(storageKey, JSON.stringify(nextReadIds)); } catch {
        // The current page still tracks read state in memory when storage is unavailable.
      }
      initialReadMarked.current = true;
    }
    setActivities(rows); setLoading(false);
  }, [user, storageKey]);

  useEffect(() => {
    if (!user) return;
    setReadIds(storedReadIds(storageKey));
    void load();
    const channel = supabase.channel(`notification-history-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `user_id=eq.${user.id}` }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "referral_rewards", filter: `referrer_user_id=eq.${user.id}` }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "referral_withdrawals", filter: `user_id=eq.${user.id}` }, () => { void load(); })
      .subscribe((status) => { setRealtimeConnected(status === "SUBSCRIBED"); });
    return () => { void supabase.removeChannel(channel); };
  }, [user, storageKey, load]);

  const unread = useMemo(() => activities.filter((a) => !readIds.includes(a.id)).length, [activities, readIds]);
  const markRead = (id: string) => {
    const next = Array.from(new Set([...readIds, id]));
    setReadIds(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next.slice(-300))); } catch {
      // The current page still tracks read state in memory when storage is unavailable.
    }
  };
  const markAllRead = () => {
    const next = Array.from(new Set([...readIds, ...activities.map((a) => a.id)]));
    setReadIds(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next.slice(-300))); } catch {
      // The current page still tracks read state in memory when storage is unavailable.
    }
  };
  const icon = (kind: Activity["kind"]) => kind === "payment" ? <CreditCard className="h-5 w-5" /> : kind === "reward" ? <Gift className="h-5 w-5" /> : <Wallet className="h-5 w-5" />;
  const variant = (status: string) => status === "success" || status === "available" ? "default" : status === "failed" || status === "reversed" ? "destructive" : "secondary";

  return (
    <div className="min-h-[100dvh] bg-background">
      <DesktopHeader profileName={user?.user_metadata?.full_name || null} isPro={false} />
      <main className="mx-auto max-w-5xl space-y-4 px-3 py-5 pb-8 sm:px-5 lg:px-8 lg:py-8">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()} aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button>
          <div className="min-w-0 flex-1"><h1 className="text-xl font-bold">ROCKCBT activity</h1><p className="text-xs text-muted-foreground">Your payments, referral earnings and withdrawals in one place.</p><p className={`mt-1 text-[11px] font-medium ${realtimeConnected ? "text-emerald-600" : "text-muted-foreground"}`}>{realtimeConnected ? "● Live updates connected" : "○ Connecting to live updates…"}</p></div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
        </div>
        <Card className="rounded-2xl"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><p className="font-semibold">Your account activity</p><p className="text-xs text-muted-foreground">{activities.length} records · {unread} unread on this device</p></div>
          <Button variant="ghost" size="sm" onClick={markAllRead} disabled={!unread}><CheckCheck className="mr-1.5 h-4 w-4" />Mark all read</Button>
        </CardContent></Card>
        {error && <Card><CardContent className="space-y-2 p-4"><p className="text-sm font-semibold">Could not load history</p><p className="text-xs text-muted-foreground">{error}</p><Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button></CardContent></Card>}
        {loading ? <div className="py-12 text-center text-sm text-muted-foreground">Loading your full account history…</div> : !error && activities.length === 0 ? (
          <Card className="rounded-2xl"><CardContent className="p-8 text-center"><Bell className="mx-auto mb-2 h-7 w-7 text-muted-foreground" /><p className="font-semibold">No activity yet</p><p className="mt-1 text-xs text-muted-foreground">Your payments, referral earnings and withdrawal updates will appear here.</p></CardContent></Card>
        ) : (
          <div className="space-y-3">
            {activities.map((item) => {
              const isUnread = !readIds.includes(item.id);
              return <Card id={item.id} key={item.id} className={`rounded-2xl transition-colors ${isUnread ? "border-primary/30 bg-primary/[0.025]" : ""}`}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">{icon(item.kind)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{item.title}</h2>{isUnread && <Badge>New</Badge>}<Badge variant={variant(item.status)} className="capitalize">{item.status}</Badge></div>
                      <p className="mt-1 text-sm font-bold tabular-nums">{money(item.amount)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{item.detail}</p>
                  <div className="grid gap-1 rounded-xl bg-muted/50 p-3 text-xs sm:grid-cols-2">
                    <div><span className="text-muted-foreground">Date & time: </span><span className="font-medium">{new Date(item.date).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</span></div>
                    <div className="min-w-0"><span className="text-muted-foreground">Reference: </span><span className="break-all font-mono">{item.reference}</span></div>
                    <div><span className="text-muted-foreground">Activity type: </span><span className="font-medium capitalize">{item.kind}</span></div>
                    <div><span className="text-muted-foreground">Record status: </span><span className="font-medium capitalize">{item.status}</span></div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link to={item.href} onClick={() => markRead(item.id)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">Open {item.kind === "payment" ? "account" : "referral"} page <ExternalLink className="h-3.5 w-3.5" /></Link>
                    <Button variant="outline" size="sm" className="h-9 rounded-xl" onClick={() => void shareReceipt(item)}><Share2 className="mr-1.5 h-3.5 w-3.5" />Share receipt</Button>
                    {!isUnread && <span className="text-[11px] text-muted-foreground">Read</span>}
                    {isUnread && <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => markRead(item.id)}>Mark as read</Button>}
                  </div>
                </CardContent>
              </Card>;
            })}
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-3 pt-2 text-xs"><Link to="/referrals" className="font-medium text-primary hover:underline">Open referral wallet</Link><Link to="/profile" className="font-medium text-primary hover:underline">Open profile</Link></div>
      </main>
    </div>
  );
};
export default Notifications;
