import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CreditCard, Gift, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

type Notice = { id: string; title: string; message: string; createdAt: string; kind: "payment" | "reward" | "withdrawal" };
const db = supabase as any;
const money = (amount: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(amount) || 0);

const NotificationBell = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notice[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const storageKey = user ? `sqp-notifications-read-${user.id}` : "";

  const load = useCallback(async () => {
    if (!user) { setItems([]); setLoading(false); return; }
    const [payments, rewards, withdrawals] = await Promise.all([
      db.from("payments").select("id,amount,status,reference,payment_method,created_at,verified_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      db.from("referral_rewards").select("id,amount,status,created_at,available_at,reversed_at").eq("referrer_user_id", user.id).order("created_at", { ascending: false }).limit(20),
      db.from("referral_withdrawals").select("id,amount,status,reference,requested_at,completed_at,failure_reason").eq("user_id", user.id).order("requested_at", { ascending: false }).limit(20),
    ]);
    const next: Notice[] = [];
    (payments.data || []).forEach((r: any) => next.push({
      id: `payment-${r.id}`, title: String(r.status).toLowerCase() === "success" ? "Payment confirmed" : String(r.status).toLowerCase() === "failed" ? "Payment failed" : "Payment pending",
      message: String(r.status).toLowerCase() === "success" ? `Your ${money(Number(r.amount))} subscription payment was successful.` : `Your ${money(Number(r.amount))} subscription payment is ${String(r.status).toLowerCase()}.`,
      createdAt: r.verified_at || r.created_at, kind: "payment",
    }));
    (rewards.data || []).forEach((r: any) => next.push({
      id: `reward-${r.id}`, title: r.status === "reversed" ? "Referral reward reversed" : "Referral reward credited",
      message: r.status === "reversed" ? `${money(Number(r.amount))} referral reward was reversed.` : `${money(Number(r.amount))} has been added to your referral earnings. Status: ${r.status}.`,
      createdAt: r.reversed_at || r.available_at || r.created_at, kind: "reward",
    }));
    (withdrawals.data || []).forEach((r: any) => {
      const status = String(r.status || "").toLowerCase();
      const failed = ["failed", "reversed"].includes(status);
      next.push({
        id: `withdrawal-${r.id}`,
        title: status === "success" ? "Withdrawal successful" : failed ? "Withdrawal update" : "Withdrawal processing",
        message: status === "success" ? `${money(Number(r.amount))} was sent to your bank account.` : failed ? `Your ${money(Number(r.amount))} withdrawal was not completed.` : `Your ${money(Number(r.amount))} withdrawal request is being processed.`,
        createdAt: r.completed_at || r.requested_at, kind: "withdrawal",
      });
    });
    next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setItems(next.slice(0, 30));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    try { setReadIds(JSON.parse(localStorage.getItem(storageKey) || "[]")); } catch { setReadIds([]); }
    void load();
    const channel = supabase.channel(`account-notifications-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `user_id=eq.${user.id}` }, (p) => {
        const row = p.new as any;
        if (String(row?.status).toLowerCase() === "success") toast({ title: "Payment confirmed", description: `Your ${money(Number(row?.amount))} subscription payment was successful.` });
        void load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "referral_rewards", filter: `referrer_user_id=eq.${user.id}` }, (p) => {
        const row = p.new as any;
        if (p.eventType === "INSERT" && row?.status !== "reversed") toast({ title: "You earned a referral reward!", description: `${money(Number(row?.amount || 500))} has been added to your referral earnings.` });
        if (p.eventType === "UPDATE" && row?.status === "reversed") toast({ title: "Referral reward update", description: "A referral reward was reversed. View the details in your history." });
        void load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "referral_withdrawals", filter: `user_id=eq.${user.id}` }, (p) => {
        const row = p.new as any;
        const status = String(row?.status || "").toLowerCase();
        if (p.eventType === "INSERT") toast({ title: "Withdrawal request received", description: `Your ${money(Number(row?.amount))} withdrawal is being processed.` });
        if (p.eventType === "UPDATE") toast({ title: status === "success" ? "Withdrawal successful" : ["failed", "reversed"].includes(status) ? "Withdrawal update" : "Withdrawal processing", description: status === "success" ? "Your payout has been sent." : ["failed", "reversed"].includes(status) ? "Your payout could not be completed. View the details in your history." : "Your withdrawal status has changed." });
        void load();
      }).subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.warn("Notification realtime connection:", status);
      });
    return () => { void supabase.removeChannel(channel); };
  }, [user, storageKey, load, toast]);

  const unread = useMemo(() => items.filter((n) => !readIds.includes(n.id)).length, [items, readIds]);

  return (
    <Button type="button" variant="ghost" size="icon" className="relative h-9 w-9 shrink-0" aria-label={unread ? `${unread} unread notifications` : "Open notifications"} onClick={() => navigate("/notifications")}>
      <Bell className="h-5 w-5" />
      {!loading && unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{unread > 9 ? "9+" : unread}</span>}
    </Button>
  );
};
export default NotificationBell;
