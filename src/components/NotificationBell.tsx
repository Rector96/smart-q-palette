import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, CreditCard, Gift, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Notice = { id: string; title: string; message: string; createdAt: string; kind: "payment" | "reward" | "withdrawal" };
const db = supabase as any;
const money = (amount: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(amount) || 0);

const NotificationBell = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Notice[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const storageKey = user ? `sqp-notifications-read-${user.id}` : "";

  const load = useCallback(async () => {
    if (!user) { setItems([]); setLoading(false); return; }
    const [payments, rewards, withdrawals] = await Promise.all([
      db.from("payments").select("id,amount,created_at").eq("user_id", user.id).eq("status", "success").order("created_at", { ascending: false }).limit(8),
      db.from("referral_rewards").select("id,amount,status,created_at").eq("referrer_user_id", user.id).order("created_at", { ascending: false }).limit(8),
      db.from("referral_withdrawals").select("id,amount,status,requested_at,completed_at").eq("user_id", user.id).order("requested_at", { ascending: false }).limit(8),
    ]);
    const next: Notice[] = [];
    (payments.data || []).forEach((r: any) => next.push({ id: `payment-${r.id}`, title: "Payment confirmed", message: `Your ${money(Number(r.amount))} subscription payment was successful. Your access is ready.`, createdAt: r.created_at, kind: "payment" }));
    (rewards.data || []).forEach((r: any) => next.push({ id: `reward-${r.id}`, title: "Referral reward credited!", message: `${money(Number(r.amount))} has been added to your referral earnings.`, createdAt: r.created_at, kind: "reward" }));
    (withdrawals.data || []).forEach((r: any) => {
      const status = String(r.status || "").toLowerCase();
      const failed = ["failed", "reversed"].includes(status);
      next.push({ id: `withdrawal-${r.id}-${status}`, title: status === "success" ? "Withdrawal successful" : failed ? "Withdrawal update" : "Withdrawal processing", message: status === "success" ? `${money(Number(r.amount))} has been sent to your bank account.` : failed ? `Your ${money(Number(r.amount))} withdrawal was not completed. Check your wallet for the returned balance.` : `Your ${money(Number(r.amount))} withdrawal request is being processed.`, createdAt: r.completed_at || r.requested_at, kind: "withdrawal" });
    });
    next.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setItems(next.slice(0,20)); setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    try { setReadIds(JSON.parse(localStorage.getItem(storageKey) || "[]")); } catch { setReadIds([]); }
    void load();
    const channel = supabase.channel(`account-notifications-${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "payments", filter: `user_id=eq.${user.id}` }, (p) => {
        if (String((p.new as any)?.status).toLowerCase() === "success") toast({ title: "Payment confirmed", description: "Your subscription payment was successful." });
        void load();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "referral_rewards", filter: `referrer_user_id=eq.${user.id}` }, (p) => {
        toast({ title: "You earned a referral reward!", description: `${money(Number((p.new as any)?.amount || 500))} has been added to your referral earnings.` });
        void load();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "referral_withdrawals", filter: `user_id=eq.${user.id}` }, (p) => {
        const status = String((p.new as any)?.status || "").toLowerCase();
        if (["success","failed","reversed"].includes(status)) toast({ title: status === "success" ? "Withdrawal successful" : "Withdrawal update", description: status === "success" ? "Your referral payout has been sent." : "Your withdrawal could not be completed. Check your wallet." });
        void load();
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, storageKey, load, toast]);

  const unread = useMemo(() => items.filter((n) => !readIds.includes(n.id)).length, [items, readIds]);
  const markRead = (id: string) => setReadIds((current) => {
    const next = current.includes(id) ? current : [...current,id];
    try { localStorage.setItem(storageKey, JSON.stringify(next.slice(-100))); } catch {}
    return next;
  });
  const markAllRead = () => {
    const next = Array.from(new Set([...readIds,...items.map((n) => n.id)]));
    setReadIds(next); try { localStorage.setItem(storageKey, JSON.stringify(next.slice(-100))); } catch {}
  };
  const icon = (kind: Notice["kind"]) => kind === "reward" ? <Gift className="h-4 w-4 text-emerald-600" /> : kind === "payment" ? <CreditCard className="h-4 w-4 text-primary" /> : <Wallet className="h-4 w-4 text-primary" />;

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" className="relative h-9 w-9" aria-label={unread ? `${unread} unread notifications` : "Notifications"}><Bell className="h-5 w-5" />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{unread > 9 ? "9+" : unread}</span>}</Button></PopoverTrigger>
    <PopoverContent align="end" sideOffset={10} className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
      <div className="flex items-center justify-between border-b px-4 py-3"><div><p className="font-semibold">Notifications</p><p className="text-xs text-muted-foreground">{unread ? `${unread} unread` : "You're all caught up"}</p></div><Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={markAllRead} disabled={!unread}><CheckCheck className="mr-1 h-3.5 w-3.5" />Mark all read</Button></div>
      <div className="max-h-[min(65vh,26rem)] overflow-y-auto">
        {loading ? <p className="p-6 text-center text-sm text-muted-foreground">Loading notifications…</p> : items.length === 0 ? <div className="p-7 text-center"><Bell className="mx-auto mb-2 h-6 w-6 text-muted-foreground" /><p className="text-sm font-medium">No notifications yet</p><p className="mt-1 text-xs text-muted-foreground">Payment confirmations, referral rewards and withdrawal updates will appear here.</p></div> : items.map((n) => {
          const isUnread = !readIds.includes(n.id);
          return <button key={n.id} type="button" onClick={() => markRead(n.id)} className={`flex w-full items-start gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-muted/60 ${isUnread ? "bg-primary/[0.035]" : ""}`}>
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">{icon(n.kind)}</span>
            <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="text-sm font-semibold">{n.title}</span>{isUnread && <Badge className="h-4 px-1.5 text-[9px]">New</Badge>}</span><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{n.message}</span><span className="mt-1 block text-[10px] text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</span></span>
          </button>;
        })}
      </div>
    </PopoverContent>
  </Popover>;
};
export default NotificationBell;
