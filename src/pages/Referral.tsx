import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Copy, Share2, Users, Wallet, Gift, Loader2, Landmark, ArrowDownToLine } from "lucide-react";
import DesktopHeader from "@/components/DesktopHeader";
import SEOHead from "@/components/SEOHead";

// The referral tables are introduced by the accompanying migration and are not
// yet present in the generated client types on the default branch.
const referralDb = supabase as any;

type ReferralProfile = { referral_code: string };
type WalletRow = { pending_balance: number; available_balance: number; lifetime_earned: number; lifetime_paid: number };
type RewardRow = { id: string; amount: number; status: string; created_at: string };
type WithdrawalRow = { id: string; amount: number; status: string; requested_at: string };
type Bank = { name: string; code: string };
type BankAccount = { id: string; bank_name: string; account_name: string; account_number_masked: string };

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
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [referralCount, setReferralCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [verifiedAccountName, setVerifiedAccountName] = useState("");
  const [bankBusy, setBankBusy] = useState(false);
  const [showBankSetup, setShowBankSetup] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("1000");
  const [withdrawBankId, setWithdrawBankId] = useState("");
  const [withdrawBusy, setWithdrawBusy] = useState(false);

  const referralUrl = useMemo(() => {
    if (!profile?.referral_code) return "";
    return `${window.location.origin}/auth?ref=${encodeURIComponent(profile.referral_code)}`;
  }, [profile?.referral_code]);

  const loadReferralData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);
    const [profileResult, walletResult, rewardsResult, withdrawalsResult, countResult, banksResult] = await Promise.all([
      referralDb.from("referral_profiles").select("referral_code").eq("user_id", user.id).maybeSingle(),
      referralDb.from("referral_wallets").select("pending_balance,available_balance,lifetime_earned,lifetime_paid").eq("user_id", user.id).maybeSingle(),
      referralDb.from("referral_rewards").select("id,amount,status,created_at").eq("referrer_user_id", user.id).order("created_at", { ascending: false }).limit(10),
      referralDb.from("referral_withdrawals").select("id,amount,status,requested_at").eq("user_id", user.id).order("requested_at", { ascending: false }).limit(5),
      referralDb.from("referral_attributions").select("referred_user_id", { count: "exact", head: true }).eq("referrer_user_id", user.id),
      referralDb.from("referral_bank_accounts").select("id,bank_name,account_name,account_number_masked").eq("user_id", user.id).eq("is_verified", true).order("created_at", { ascending: false }),
    ]);
    const hasError = [profileResult, walletResult, rewardsResult, withdrawalsResult, countResult, banksResult].some((result) => result.error);
    if (hasError) {
      setLoadError(true);
    } else {
      setProfile(profileResult.data);
      if (walletResult.data) setWallet(walletResult.data);
      setRewards(rewardsResult.data || []);
      setWithdrawals(withdrawalsResult.data || []);
      setReferralCount(countResult.count || 0);
      setBankAccounts(banksResult.data || []);
      if (!withdrawBankId && banksResult.data?.[0]?.id) setWithdrawBankId(banksResult.data[0].id);
    }
    setLoading(false);
  }, [user, withdrawBankId]);

  useEffect(() => { void loadReferralData(); }, [loadReferralData]);

  useEffect(() => {
    let active = true;
    void supabase.functions.invoke("referral-bank-account", { body: { action: "list_banks" } }).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error("Could not load bank list:", error);
        return;
      }
      setBanks(data?.banks || []);
    });
    return () => { active = false; };
  }, []);

  const copyLink = async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      toast({ title: "Referral link copied", description: "Share it to earn ₦500 when a referred friend makes a qualifying payment." });
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
    } else await copyLink();
  };

  const verifyBank = async () => {
    if (!bankCode || !/^\d{10}$/.test(accountNumber)) {
      toast({ title: "Check your bank details", description: "Choose a bank and enter the 10-digit account number.", variant: "destructive" });
      return;
    }
    setBankBusy(true);
    setVerifiedAccountName("");
    const { data, error } = await supabase.functions.invoke("referral-bank-account", {
      body: { action: "resolve_account", bank_code: bankCode, account_number: accountNumber },
    });
    setBankBusy(false);
    if (error || !data?.verified) {
      toast({ title: "Account verification failed", description: data?.error || error?.message || "Please check the details and try again.", variant: "destructive" });
      return;
    }
    setVerifiedAccountName(data.account_name);
    toast({ title: "Account verified", description: "Confirm the account name before saving." });
  };

  const saveBank = async () => {
    setBankBusy(true);
    const { data, error } = await supabase.functions.invoke("referral-bank-account", {
      body: { action: "save_account", bank_code: bankCode, account_number: accountNumber, bank_name: bankName },
    });
    setBankBusy(false);
    if (error || !data?.saved) {
      toast({ title: "Could not save bank account", description: data?.error || error?.message || "Please try again.", variant: "destructive" });
      return;
    }
    setAccountNumber("");
    setVerifiedAccountName("");
    setShowBankSetup(false);
    if (data?.bank_account?.id) setWithdrawBankId(data.bank_account.id);
    setBankCode("");
    setBankName("");
    await loadReferralData();
    toast({ title: "Bank account saved", description: "Your verified account is ready for referral withdrawals." });
  };

  const requestWithdrawal = async () => {
    const amount = Number(withdrawAmount);
    if (!withdrawBankId || !Number.isSafeInteger(amount) || amount < 1000) {
      toast({ title: "Check withdrawal details", description: "Select a saved bank account and enter at least ₦1,000.", variant: "destructive" });
      return;
    }
    if (amount > Number(wallet.available_balance)) {
      toast({ title: "Insufficient balance", description: "Your withdrawal cannot exceed your available balance.", variant: "destructive" });
      return;
    }
    setWithdrawBusy(true);
    const { data, error } = await supabase.functions.invoke("referral-withdraw", {
      body: { amount, bank_account_id: withdrawBankId },
    });
    setWithdrawBusy(false);
    if (error || !data?.accepted) {
      toast({ title: "Withdrawal not submitted", description: data?.error || error?.message || "Please try again.", variant: "destructive" });
      return;
    }
    setWithdrawAmount("1000");
    await loadReferralData();
    toast({ title: "Withdrawal submitted", description: "Paystack is processing your transfer. Your history will update when the transfer is confirmed." });
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

            {(bankAccounts.length > 0 || showBankSetup) && <Card className="rounded-2xl shadow-sm">
              <CardContent className="space-y-4 p-4">
                <div className="flex items-center gap-2"><Landmark className="h-5 w-5 text-primary" /><div><h2 className="font-bold">Bank account</h2><p className="text-xs text-muted-foreground">Verify the account name before saving your payout account.</p></div></div>
                {bankAccounts.map((account) => (
                  <div key={account.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold">{account.account_name}</p><p className="text-xs text-muted-foreground">{account.bank_name} · {account.account_number_masked}</p></div>
                    <Badge variant="secondary">Verified</Badge>
                  </div>
                ))}
                {showBankSetup && <>
                <p className="text-xs text-muted-foreground">The verified bank account holder name must match your Smart Q Palette signup name: <span className="font-semibold text-foreground">{user?.user_metadata?.full_name || "your registered full name"}</span>.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="referral-bank">Bank</Label>
                    <select id="referral-bank" value={bankCode} onChange={(event) => { const selected = banks.find((item) => item.code === event.target.value); setBankCode(event.target.value); setBankName(selected?.name || ""); setVerifiedAccountName(""); }} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">Select your bank</option>{banks.map((bank) => <option key={bank.code} value={bank.code}>{bank.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5"><Label htmlFor="referral-account-number">10-digit account number</Label><Input id="referral-account-number" inputMode="numeric" maxLength={10} value={accountNumber} onChange={(event) => { setAccountNumber(event.target.value.replace(/\D/g, "").slice(0, 10)); setVerifiedAccountName(""); }} placeholder="Enter account number" /></div>
                </div>
                {verifiedAccountName && <div className="rounded-xl border border-primary/30 bg-primary/5 p-3"><p className="text-xs text-muted-foreground">Paystack verified account name</p><p className="font-semibold">{verifiedAccountName}</p></div>}
                {!verifiedAccountName ? <Button variant="outline" className="w-full" disabled={bankBusy || !banks.length} onClick={() => void verifyBank()}>{bankBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Verify account</Button> :
                  <Button className="w-full" disabled={bankBusy} onClick={() => void saveBank()}>{bankBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Confirm and save bank account</Button>}
                </>}
                {!showBankSetup && <Button variant="outline" className="w-full" onClick={() => setShowBankSetup(true)}>Add another bank account</Button>}
              </CardContent>
            </Card>}

            <Card className="rounded-2xl shadow-sm">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2"><ArrowDownToLine className="h-5 w-5 text-primary" /><div><h2 className="font-bold">Withdraw referral earnings</h2><p className="text-xs text-muted-foreground">Minimum withdrawal is ₦1,000.</p></div></div>
                {bankAccounts.length > 0 ? <>
                  <div className="mb-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">Withdrawal destination: <span className="font-semibold text-foreground">{bankAccounts.find((account) => account.id === withdrawBankId)?.account_name || "Select a verified bank account"}</span></div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5"><Label htmlFor="withdraw-amount">Amount (₦)</Label><Input id="withdraw-amount" type="number" min="1000" step="1" value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} /></div>
                    <div className="space-y-1.5"><Label htmlFor="withdraw-bank">Send to</Label>
                      <select id="withdraw-bank" value={withdrawBankId} onChange={(event) => setWithdrawBankId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="">Select saved account</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.bank_name} · {account.account_number_masked}</option>)}
                      </select>
                    </div>
                  </div>
                </> : <p className="text-sm text-muted-foreground">Add a bank account in your name to continue. We will verify it before any withdrawal.</p>}
                <Button className="w-full" disabled={withdrawBusy || Number(wallet.available_balance) < 1000} onClick={() => { if (!bankAccounts.length) { setShowBankSetup(true); return; } void requestWithdrawal(); }}>
                  {withdrawBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{bankAccounts.length ? "Request withdrawal" : "Withdraw"}
                </Button>
                <p className="text-[11px] text-muted-foreground">Your available balance is reserved when you submit. It is restored automatically if Paystack reports a failed transfer.</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between"><h2 className="font-bold">Recent referral rewards</h2><Badge variant="secondary">₦500 each</Badge></div>
                {rewards.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Your successful referrals and rewards will appear here.</p> : rewards.map((reward) => (
                  <div key={reward.id} className="flex items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0">
                    <div><p className="text-sm font-semibold">Referral reward</p><p className="text-[11px] text-muted-foreground">{new Date(reward.created_at).toLocaleDateString()}</p></div>
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
