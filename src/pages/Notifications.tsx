import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Bell, CheckCheck, CreditCard, Gift, Wallet, ExternalLink, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import DesktopHeader from "@/components/DesktopHeader";

type Activity = {
  id: string; title: string; description: string; amount: number; status: string;
  date: string; reference: string; kind: "payment" | "reward" | "withdrawal";
  detail: string; href: string;
};
const db = supabase as any;
const money = (amount: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(amount) || 0);
const readKey = (id: string) => `sqp-notifications-read-${id}`;

const Notifications = () => {
  const { user } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const storageKey = user ? readKey(user.id) : "";

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError("");
    const [payments, rewards, withdrawals] = await Promise.all([
      db.from("payments").select("id,amount,status,reference,payment_method,created_at,updated_at,verified_at,plan_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
      db.from("referral_rewards").select("id,amount,status,payment_id,created_at,available_at,reversed_at").eq("referrer_user_id", user.id).order("created_at", { ascending: false }).limit(100),
      db.from("referral_withdrawals").select("id,amount,status,reference,requested_at,completed_at,failure_reason,bank_account_id").eq("user_id", user.id).order("requested_at", { ascending: false }).limit(100),
    ]);
    const failed = [payments, rewards, withdrawals].find((x) => x.error);
    if (failed) { setError(failed.error.message || "We could not load your account history."); setActivities([]); setLoading(false); return; }
    const rows: Activity[] = [];
    (payments.data || []).forEach((r: any) => rows.push({
      id: `payment-${r.id}`, title: r.status === "success" ? "Subscription payment successful" : r.status === "failed" ? "Subscription payment failed" : "Subscription payment pending",
      description: `${money(Number(r.amount))} · ${r.payment_method || "Payment"} · ${r.plan_id || "Subscription"}`,
      amount: Number(r.amount), status: String(r.status), date: r.verified_at || r.updated_at || r.created_at,
      reference: r.reference || r.id, kind: "payment", detail: r.status === "success" ? "Your subscription payment has been confirmed and recorded on your account." : r.status === "failed" ? "This payment was not completed. If money was deducted, contact support with the reference below." : "This payment is awaiting confirmation.",
      href: "/profile",
    }));
    (rewards.data || []).forEach((r: any) => rows.push({
      id: `reward-${r.id}`, title: r.status === "reversed" ? "Referral reward reversed" : "Referral reward earned",
      description: `Referral commission · ${money(Number(r.amount))}`,
      amount: Number(r.amount), status: String(r.status), date: r.reversed_at || r.available_at || r.created_at,
      reference: r.payment_id || r.id, kind: "reward",
      detail: r.status === "reversed" ? "This reward was reversed following a payment reversal or refund." : "This reward is linked to a successful subscription made through your referral link.",
      href: "/referrals#rewards-history",
    }));
    (withdrawals.data || []).forEach((r: any) => rows.push({
      id: `withdrawal-${r.id}`, title: r.status === "success" ? "Withdrawal paid" : ["failed", "reversed"].includes(r.status) ? "Withdrawal not completed" : "Withdrawal request update",
      description: `Bank payout · ${money(Number(r.amount))}`,
      amount: Number(r.amount), status: String(r.status), date: r.completed_at || r.requested_at,
      reference: r.reference || r.id, kind: "withdrawal",
      detail: r.status === "success" ? "The payout was marked successful by the payment provider." : r.status === "failed" || r.status === "reversed" ? `The payout did not complete. ${r.failure_reason || "The available balance is restored according to the withdrawal process."}` : "Your withdrawal request has been received and is being processed.",
      href: "/referrals#withdrawal-history",
    }));
    rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setActivities(rows); setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    try { setReadIds(JSON.parse(localStorage.getItem(storageKey) || "[]")); } catch { setReadIds([]); }
    void load();
    const channel = supabase.channel(`notification-history-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `user_id=eq.${user.id}` }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "referral_rewards", filter: `referrer_user_id=eq.${user.id}` }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "referral_withdrawals", filter: `user_id=eq.${user.id}` }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, storageKey, load]);

  const unread = useMemo(() => activities.filter((a) => !readIds.includes(a.id)).length, [activities, readIds]);
  const markRead = (id: string) => {
    const next = Array.from(new Set([...readIds, id]));
    setReadIds(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next.slice(-300))); } catch {}
  };
  const markAllRead = () => {
    const next = Array.from(new Set([...readIds, ...activities.map((a) => a.id)]));
    setReadIds(next); try { localStorage.setItem(storageKey, JSON.stringify(next.slice(-300))); } catch {}
  };
  const icon = (kind: Activity["kind"]) => kind === "payment" ? <CreditCard className="h-5 w-5" /> : kind === "reward" ? <Gift className="h-5 w-5" /> : <Wallet className="h-5 w-5" />;
  const variant = (status: string) => status === "success" || status === "available" ? "default" : status === "failed" || status === "reversed" ? "destructive" : "secondary";

  return (
    <div className="min-h-[100dvh] bg-background">
      <DesktopHeader profileName={user?.user_metadata?.full_name || null} isPro={false} />
      <main className="mx-auto max-w-3xl space-y-4 px-3 py-5 pb-8 sm:px-5 lg:px-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()} aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button>
          <div className="min-w-0 flex-1"><h1 className="text-xl font-bold">Notifications & account history</h1><p className="text-xs text-muted-foreground">Payments, referral earnings and withdrawals in one place.</p></div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
        </div>
        <Card className="rounded-2xl"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><p className="font-semibold">Your account activity</p><p className="text-xs text-muted-foreground">{activities.length} records · {unread} unread on this device</p></div>
          <Button variant="ghost" size="sm" onClick={markAllRead} disabled={!unread}><CheckCheck className="mr-1.5 h-4 w-4" />Mark all read</Button>
        </CardContent></Card>
        {error && <Card><CardContent className="space-y-2 p-4"><p className="text-sm font-semibold">Could not load history</p><p className="text-xs text-muted-foreground">{error}</p><Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button></CardContent></Card>}
        {loading ? <div className="py-12 text-center text-sm text-muted-foreground">Loading your full account history…</div> : !error && activities.length === 0 ? (
          <Card className="rounded-2xl"><CardContent className="p-8 text-center"><Bell className="mx-auto mb-2 h-7 w-7 text-muted-foreground" /><p className="font-semibold">No activity yet</p><p className="mt-1 text-xs text-muted-foreground">Your successful payments, referral rewards and withdrawal updates will appear here.</p></CardContent></Card>
        ) : (
          <div className="space-y-3">
            {activities.map((item) => {
              const isUnread = !readIds.includes(item.id);
              return <Card key={item.id} className={`rounded-2xl transition-colors ${isUnread ? "border-primary/30 bg-primary/[0.025]" : ""}`}>
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
