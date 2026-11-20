import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Copy, Share2, Users, Wallet, Gift, Clock, ArrowUpRight, Loader2 } from "lucide-react";
import DesktopHeader from "@/components/DesktopHeader";
import SEOHead from "@/components/SEOHead";

type ReferralProfile = { referral_code: string };
type WalletRow = { pending_balance: number; available_balance: number; lifetime_earned: number; lifetime_paid: number };
type RewardRow = { id: string; amount: number; status: string; created_at: string };
type WithdrawalRow = { id: string; amount: number; status: string; requested_at: string };

const money = (value: number) => new Intl.NumberFormat("en-NG", {
  style: "currency", currency: "NGN", maximumFractionDigits: 0,
}).format(Number(value) || 0);

const Referral = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<ReferralProfile | null>(null);
  const [wallet, setWallet] = useState<WalletRow>({ pending_balance: 0, available_balance: 0, lifetime_earned: 0, lifetime_paid: 0 });
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [referralCount, setReferralCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const referralUrl = useMemo(() => {
    if (!profile?.referral_code) return "";
    return `${window.location.origin}/auth?ref=${encodeURIComponent(profile.referral_code)}`;
  }, [profile?.referral_code]);

  const loadReferralData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);
    const [profileResult, walletResult, rewardsResult, withdrawalsResult, countResult] = await Promise.all([
      supabase.from("referral_profiles").select("referral_code").eq("user_id", user.id).maybeSingle(),
      supabase.from("referral_wallets").select("pending_balance,available_balance,lifetime_earned,lifetime_paid").eq("user_id", user.id).maybeSingle(),
      supabase.from("referral_rewards").select("id,amount,status,created_at").eq("referrer_user_id", user.id).order("created_at", { ascending: false }).limit(10),
      supabase.from("referral_withdrawals").select("id,amount,status,requested_at").eq("user_id", user.id).order("requested_at", { ascending: false }).limit(5),
      supabase.from("referral_attributions").select("referred_user_id", { count: "exact", head: true }).eq("referrer_user_id", user.id),
    ]);
    const hasError = [profileResult, walletResult, rewardsResult, withdrawalsResult, countResult].some((result) => result.error);
    if (hasError) {
      setLoadError(true);
    } else {
      setProfile(profileResult.data);
      if (walletResult.data) setWallet(walletResult.data);
      setRewards(rewardsResult.data || []);
      setWithdrawals(withdrawalsResult.data || []);
      setReferralCount(countResult.count || 0);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { void loadReferralData(); }, [loadReferralData]);

  const copyLink = async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      toast({ title: "Referral link copied", description: "Share it with friends to earn ₦500 when they make a qualifying payment." });
    } catch {
      toast({ title: "Could not copy link", description: "Please copy the link manually.", variant: "destructive" });
    }
  };

  const shareLink = async () => {
    if (!referralUrl) return;
    const shareData = { title: "Join Smart Q Palette", text: "Practise smarter with Smart Q Palette. Join using my referral link.", url: referralUrl };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch (error) {
        if ((error as Error).name !== "AbortError") toast({ title: "Sharing unavailable", description: "You can copy your referral link instead." });
      }
    } else {
      await copyLink();
    }
  };

  const minimumProgress = Math.min(100, (Number(wallet.available_balance) / 1000) * 100);

  return (
    <div className="min-h-[100dvh] bg-background">
      <SEOHead title="Refer & Earn – Smart Q Palette" description="Share Smart Q Palette and earn referral rewards." path="/referrals" />
      <DesktopHeader profileName={user?.user_metadata?.full_name || null} isPro={false} />
      <main className="mx-auto max-w-3xl space-y-5 px-3 py-5 sm:px-4 lg:px-6 lg:py-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Smart Q Palette rewards</p>
          <h1 className="mt-1 text-2xl font-bold">Refer & Earn</h1>
          <p className="mt-1 text-sm text-muted-foreground">Invite friends. When someone joins through your link and makes a qualifying ₦2,500 payment, you earn ₦500.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading your referral wallet…</div>
        ) : loadError ? (
          <Card className="rounded-2xl"><CardContent className="space-y-3 p-5 text-center">
            <p className="font-semibold">Your referral wallet is not ready yet</p>
            <p className="text-sm text-muted-foreground">The referral database setup is still being prepared. Your account and practice progress are not affected.</p>
            <Button variant="outline" onClick={() => void loadReferralData()}>Try again</Button>
          </CardContent></Card>
        ) : (
          <>
            <Card className="overflow-hidden rounded-2xl border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card shadow-sm">
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-sm font-semibold text-muted-foreground">Available to withdraw</p><p className="mt-1 text-3xl font-extrabold">{money(wallet.available_balance)}</p></div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10"><Wallet className="h-6 w-6 text-primary" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-background/80 p-3"><p className="text-xs text-muted-foreground">Pending rewards</p><p className="mt-1 text-lg font-bold">{money(wallet.pending_balance)}</p></div>
                  <div className="rounded-xl bg-background/80 p-3"><p className="text-xs text-muted-foreground">Lifetime earned</p><p className="mt-1 text-lg font-bold">{money(wallet.lifetime_earned)}</p></div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Withdrawal minimum: ₦1,000</span><span className="font-semibold">{Math.round(minimumProgress)}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${minimumProgress}%` }} /></div>
                  <p className="text-xs text-muted-foreground">{Number(wallet.available_balance) >= 1000 ? "You have reached the withdrawal minimum." : `${money(Math.max(0, 1000 - Number(wallet.available_balance)))} more in available rewards to reach the withdrawal minimum.`}</p>
                </div>
                <Button className="w-full rounded-xl" disabled>
                  Withdrawals will be available after bank verification is enabled
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
              <CardContent className="space-y-3 p-4">
                <div><h2 className="font-bold">Your referral link</h2><p className="text-xs text-muted-foreground">Share this link with friends and classmates.</p></div>
                <div className="flex min-w-0 items-center gap-2 rounded-xl border bg-muted/40 p-2">
                  <span className="min-w-0 flex-1 truncate px-1 text-xs">{referralUrl || "Your link will appear here once your referral profile is created."}</span>
                  <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => void copyLink()} disabled={!referralUrl} aria-label="Copy referral link"><Copy className="h-4 w-4" /></Button>
                </div>
                <Button className="w-full rounded-xl" onClick={() => void shareLink()} disabled={!referralUrl}><Share2 className="mr-2 h-4 w-4" />Share referral link</Button>
                {profile?.referral_code && <p className="text-center text-[11px] text-muted-foreground">Your referral code: <span className="font-semibold text-foreground">{profile.referral_code}</span></p>}
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Card className="rounded-2xl"><CardContent className="flex items-center gap-3 p-3"><Users className="h-5 w-5 text-primary" /><div><p className="text-xl font-bold">{referralCount}</p><p className="text-[11px] text-muted-foreground">People referred</p></div></CardContent></Card>
              <Card className="rounded-2xl"><CardContent className="flex items-center gap-3 p-3"><Gift className="h-5 w-5 text-primary" /><div><p className="text-xl font-bold">{rewards.filter((item) => item.status === "available").length}</p><p className="text-[11px] text-muted-foreground">Available rewards</p></div></CardContent></Card>
            </div>

            <Card className="rounded-2xl shadow-sm">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between"><h2 className="font-bold">Recent referral rewards</h2><Badge variant="secondary">₦500 each</Badge></div>
                {rewards.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Your successful referrals and rewards will appear here.</p> : rewards.map((reward) => (
                  <div key={reward.id} className="flex items-center justify-between gap-3 border-b last:border-0 pb-3 last:pb-0">
                    <div className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10"><Gift className="h-4 w-4 text-primary" /></div><div><p className="text-sm font-semibold">Referral reward</p><p className="text-[11px] text-muted-foreground">{new Date(reward.created_at).toLocaleDateString()}</p></div></div>
                    <div className="text-right"><p className="text-sm font-bold">+{money(reward.amount)}</p><Badge variant={reward.status === "available" ? "default" : "secondary"}>{reward.status}</Badge></div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
              <CardContent className="space-y-3 p-4">
                <h2 className="font-bold">Withdrawal history</h2>
                {withdrawals.length === 0 ? <p className="py-3 text-center text-sm text-muted-foreground">You have not made a withdrawal yet.</p> : withdrawals.map((item) => (
                  <div key={item.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                    <div><p className="text-sm font-semibold">{money(item.amount)}</p><p className="text-[11px] text-muted-foreground">{new Date(item.requested_at).toLocaleDateString()}</p></div>
                    <Badge variant={item.status === "success" ? "default" : "secondary"}>{item.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
        <p className="pb-2 text-center text-[11px] text-muted-foreground">Referral rewards are credited only after a qualifying payment is verified. Minimum withdrawal is ₦1,000.</p>
      </main>
    </div>
  );
};

export default Referral;
