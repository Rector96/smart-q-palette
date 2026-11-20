import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, Gift, Share2, Users, Wallet, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import SEOHead from "@/components/SEOHead";

type WalletTransaction = {
  id: string;
  entry_type: string;
  amount: number | string;
  description: string | null;
  created_at: string;
};

const money = (amount: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount);

const Referrals = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [referralCode, setReferralCode] = useState("");
  const [referralCount, setReferralCount] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [loading, setLoading] = useState(true);

  const referralLink = useMemo(
    () => referralCode ? `${window.location.origin}/auth?ref=${encodeURIComponent(referralCode)}` : "",
    [referralCode],
  );

  const loadReferralData = useCallback(async () => {
    if (!user) return;
    const db = supabase as any;
    const [profileResult, referralResult, balanceResult, transactionResult] = await Promise.all([
      db.from("referral_profiles").select("referral_code").eq("user_id", user.id).maybeSingle(),
      db.from("referral_attributions").select("referred_user_id", { count: "exact", head: true }).eq("referrer_user_id", user.id),
      db.from("referral_wallet_balances").select("available_balance, total_earned").eq("user_id", user.id).maybeSingle(),
      db.from("referral_wallet_transactions")
        .select("id, entry_type, amount, description, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (profileResult.error || referralResult.error || balanceResult.error || transactionResult.error) {
      toast({ title: "Could not load referral details", description: "Please refresh and try again.", variant: "destructive" });
      setLoading(false);
      return;
    }
    setReferralCode(profileResult.data?.referral_code || "");
    setReferralCount(referralResult.count || 0);
    setWalletBalance(Number(balanceResult.data?.available_balance || 0));
    setTotalEarned(Number(balanceResult.data?.total_earned || 0));
    setTransactions(transactionResult.data || []);
    setLoading(false);
  }, [user, toast]);

  useEffect(() => {
    void loadReferralData();
  }, [loadReferralData]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`referral-wallet-${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "referral_wallet_transactions",
        filter: `user_id=eq.${user.id}`,
      }, () => void loadReferralData())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, loadReferralData]);

  const copyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      toast({ title: "Referral link copied", description: "Share it with friends and classmates." });
    } catch {
      toast({ title: "Copy unavailable", description: "Please copy the referral link manually.", variant: "destructive" });
    }
  };

  const shareLink = async () => {
    if (!referralLink) return;
    const shareData = {
      title: "Join Smart Q Palette",
      text: "Practise past questions, improve your scores and prepare smarter with Smart Q Palette.",
      url: referralLink,
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else await copyLink();
    } catch (error) {
      if ((error as Error).name !== "AbortError") await copyLink();
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <SEOHead title="Refer & Earn – Smart Q Palette" description="Invite friends to Smart Q Palette and earn rewards when they become paying customers." path="/referrals" />
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-5 lg:px-6 lg:py-7">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} aria-label="Back to dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">Refer & Earn</h1>
            <p className="text-sm text-muted-foreground">Invite friends. Earn ₦500 for every qualifying payment.</p>
          </div>
        </div>

        <Card className="overflow-hidden rounded-2xl border-primary/15 bg-gradient-to-br from-primary/10 via-card to-card">
          <CardContent className="space-y-3 p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Gift className="h-4 w-4" /> Your referral earnings
            </div>
            <p className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              {loading ? "—" : money(walletBalance)}
            </p>
            <p className="text-xs text-muted-foreground">Available balance · Minimum withdrawal ₦1,000</p>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-xl bg-background/80 p-3">
                <p className="text-xl font-bold">{loading ? "—" : referralCount}</p>
                <p className="text-xs text-muted-foreground">People referred</p>
              </div>
              <div className="rounded-xl bg-background/80 p-3">
                <p className="text-xl font-bold">{loading ? "—" : money(totalEarned)}</p>
                <p className="text-xs text-muted-foreground">Total commissions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div>
              <h2 className="font-semibold">Your unique referral link</h2>
              <p className="mt-1 text-xs text-muted-foreground">Anyone can join using your link. You earn when they complete a qualifying ₦2,500 payment.</p>
            </div>
            <div className="rounded-xl border bg-muted/40 px-3 py-3 text-sm break-all">
              {loading ? "Preparing your referral link…" : referralLink || "Your referral code is being prepared."}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={copyLink} disabled={!referralLink} variant="outline" className="w-full">
                <Copy className="mr-2 h-4 w-4" /> Copy link
              </Button>
              <Button onClick={shareLink} disabled={!referralLink} className="w-full">
                <Share2 className="mr-2 h-4 w-4" /> Share link
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Bank withdrawals</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Automatic bank withdrawals will be available once bank-account verification and Paystack transfers are connected. Your referral earnings will remain recorded safely in your wallet.
            </p>
            <div className="flex items-center gap-2 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
              <Clock3 className="h-4 w-4 shrink-0" />
              Minimum withdrawal: ₦1,000
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="space-y-3 p-4 sm:p-5">
            <h2 className="font-semibold">Recent wallet activity</h2>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading your activity…</p>
            ) : transactions.length === 0 ? (
              <div className="rounded-xl bg-muted/40 p-5 text-center">
                <Users className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium">Your first reward is waiting</p>
                <p className="mt-1 text-xs text-muted-foreground">Share your link. Your ₦500 commission appears after a referred student makes a verified payment.</p>
              </div>
            ) : (
              <div className="divide-y">
                {transactions.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.description || item.entry_type.replaceAll("_", " ")}</p>
                      <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
                    </div>
                    <span className={`shrink-0 text-sm font-bold ${Number(item.amount) >= 0 ? "text-emerald-600" : "text-foreground"}`}>
                      {Number(item.amount) > 0 ? "+" : ""}{money(Number(item.amount))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Referrals;
