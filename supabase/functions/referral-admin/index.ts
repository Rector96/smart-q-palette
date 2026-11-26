import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isTransferSettlementRecorded } from "../_shared/financial-reconciliation.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});

type Numeric = number | string;
type ProfileRow = { user_id: string; full_name: string | null; email: string | null; is_subscribed?: boolean };
type ReferralProfileRow = {
  user_id: string; referral_code?: string | null; withdrawals_blocked?: boolean;
  withdrawals_block_reason?: string | null;
};
type BankRow = { bank_name: string; account_name: string; account_number_masked: string };
type ReferralWithdrawalRow = {
  id: string; user_id: string; bank_account_id: string; amount: Numeric; currency: string;
  status: string; reference: string; paystack_transfer_code: string | null;
  failure_reason: string | null; requested_at: string; completed_at: string | null;
  referral_bank_accounts: BankRow | BankRow[] | null;
};
type ReferralWalletRow = {
  user_id: string; pending_balance: Numeric; available_balance: Numeric; lifetime_earned: Numeric;
  lifetime_paid: Numeric; recovery_balance: Numeric; updated_at: string;
};
type ReferralTransactionRow = {
  id: string; user_id: string; transaction_type: string; amount: Numeric; status: string;
  reference_type: string; reference_id: string; idempotency_key: string;
  description: string | null; created_at: string;
};
type ReferralRewardRow = {
  id: string; payment_id: string; referrer_user_id: string; referred_user_id: string;
  amount: Numeric; status: string; created_at: string; available_at: string | null; reversed_at: string | null;
};
type ReferralAttributionRow = {
  referred_user_id: string; referrer_user_id: string; referral_code: string; created_at: string;
};
type PaymentRow = {
  id: string; user_id: string; amount: Numeric; refunded_amount_kobo: Numeric;
  currency: string; status: string; payment_method: string | null;
  plan_id: string | null; verified_at: string | null; created_at: string;
  reference?: string | null;
};
type PaymentDetailsRow = { id: string; reference: string | null; amount: Numeric; status: string; verified_at: string | null };
type WithdrawalControlRow = { user_id: string; withdrawals_blocked: boolean; withdrawals_block_reason: string | null };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey || !paystackSecret) {
      return json({ error: "Referral payout administration is not configured." }, 503);
    }

    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token || token === authorization) return json({ error: "Please sign in first." }, 401);

    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Your session has expired. Please sign in again." }, 401);

    const serviceClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: adminRole, error: roleError } = await serviceClient.from("user_roles")
      .select("user_id").eq("user_id", authData.user.id).eq("role", "admin").maybeSingle();
    if (roleError || !adminRole) return json({ error: "Only platform administrators can manage referral payouts." }, 403);

    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "";

    if (action === "list") {
      const [withdrawalResult, otpCountResult] = await Promise.all([
        serviceClient.from("referral_withdrawals")
          .select("id,user_id,bank_account_id,amount,currency,status,reference,paystack_transfer_code,failure_reason,requested_at,completed_at,referral_bank_accounts(bank_name,account_name,account_number_masked)", { count: "exact" })
          .in("status", ["otp", "processing", "queued"])
          .order("requested_at", { ascending: false }).limit(100),
        serviceClient.from("referral_withdrawals")
          .select("id", { count: "exact", head: true }).eq("status", "otp"),
      ]);
      if (withdrawalResult.error || otpCountResult.error) {
        console.error("Could not list referral withdrawals:", withdrawalResult.error?.message || otpCountResult.error?.message);
        return json({ error: "Could not load referral withdrawals." }, 500);
      }
      const withdrawalRows = (withdrawalResult.data || []) as ReferralWithdrawalRow[];
      const userIds = [...new Set(withdrawalRows.map((row) => row.user_id))];
      const { data: profiles, error: profilesError } = userIds.length
        ? await serviceClient.from("profiles").select("user_id,full_name,email").in("user_id", userIds)
        : { data: [] as ProfileRow[], error: null };
      if (profilesError) {
        console.error("Could not load withdrawal customer details:", profilesError.message);
        return json({ error: "Could not load withdrawal customer details." }, 500);
      }
      const profileRows = (profiles || []) as ProfileRow[];
      const profileMap = new Map(profileRows.map((profile) => [profile.user_id, profile] as const));
      const withdrawals = withdrawalRows.map((row) => ({
        ...row,
        customer_name: profileMap.get(row.user_id)?.full_name || "Customer",
        customer_email: profileMap.get(row.user_id)?.email || "",
        bank: Array.isArray(row.referral_bank_accounts) ? row.referral_bank_accounts[0] : row.referral_bank_accounts,
      }));
      const withdrawalCount = withdrawalResult.count ?? withdrawals.length;
      return json({
        withdrawals,
        withdrawal_count: withdrawalCount,
        otp_count: otpCountResult.count ?? 0,
        details_limited: withdrawalCount > withdrawals.length,
      });
    }

    if (action === "verify_transfer") {
      const withdrawalId = typeof body?.withdrawal_id === "string" ? body.withdrawal_id.trim() : "";
      if (!withdrawalId) return json({ error: "Select a withdrawal to verify." }, 400);

      const { data: withdrawal, error: lookupError } = await serviceClient.from("referral_withdrawals")
        .select("id,status,reference,paystack_transfer_code")
        .eq("id", withdrawalId).maybeSingle();
      if (lookupError) {
        console.error("Could not load referral withdrawal for verification:", lookupError.message);
        return json({ error: "Could not load this withdrawal." }, 500);
      }
      if (!withdrawal) return json({ error: "Withdrawal request was not found." }, 404);
      if (["success", "failed", "reversed"].includes(withdrawal.status)) {
        return json({
          verified: true,
          status: withdrawal.status,
          message: `This transfer is already recorded as ${withdrawal.status}.`,
        });
      }

      const response = await fetch(
        `https://api.paystack.co/transfer/verify/${encodeURIComponent(withdrawal.reference)}`,
        {
          headers: { Authorization: `Bearer ${paystackSecret}` },
          signal: AbortSignal.timeout(30000),
        },
      );
      const payload = await response.json().catch(() => null);
      const transfer = payload?.data;
      if (!response.ok || payload?.status !== true || !transfer || typeof transfer.status !== "string") {
        console.warn("Paystack transfer verification could not be confirmed:", {
          reference: withdrawal.reference,
          httpStatus: response.status,
          message: typeof payload?.message === "string" ? payload.message : "invalid_response",
        });
        return json({
          verified: false,
          error: "Paystack status could not be confirmed. The reserved balance has not been changed.",
        }, 502);
      }
      if (typeof transfer.reference === "string" && transfer.reference !== withdrawal.reference) {
        console.error("Paystack returned a different transfer reference during verification.");
        return json({
          verified: false,
          error: "Paystack returned a reference that does not match this withdrawal.",
        }, 502);
      }

      const transferStatus = transfer.status.toLowerCase();
      if (["success", "failed", "reversed"].includes(transferStatus)) {
        const { data: settlement, error: settlementError } = await serviceClient.rpc("settle_referral_withdrawal", {
          p_reference: withdrawal.reference,
          p_outcome: transferStatus,
          p_transfer_code: typeof transfer.transfer_code === "string"
            ? transfer.transfer_code
            : withdrawal.paystack_transfer_code,
          p_failure_reason: typeof payload.message === "string"
            ? payload.message
            : "Paystack could not complete the transfer.",
        });
        const settlementRecorded = !settlementError &&
          isTransferSettlementRecorded(settlement, transferStatus);
        if (!settlementRecorded) {
          console.error("Verified transfer could not be settled:", {
            reference: withdrawal.reference,
            settlementError: settlementError?.message,
            settlement,
          });
          return json({
            verified: false,
            status: "pending_reconciliation",
            error: "Paystack returned a final status, but the wallet settlement could not be confirmed. Funds remain under reconciliation.",
          }, 202);
        }
        return json({
          verified: true,
          status: transferStatus,
          message: `Paystack confirmed ${transferStatus}; the withdrawal record was reconciled.`,
        });
      }

      if (!["otp", "pending", "processing", "queued"].includes(transferStatus)) {
        console.warn("Paystack returned an unrecognized transfer status:", {
          reference: withdrawal.reference,
          status: transferStatus,
        });
        return json({
          verified: false,
          status: "pending_reconciliation",
          error: "Paystack returned an unrecognized status. Funds remain reserved pending review.",
        }, 202);
      }

      const nextStatus = transferStatus === "otp" ? "otp" : "processing";
      const { data: updatedWithdrawal, error: updateError } = await serviceClient.from("referral_withdrawals")
        .update({ status: nextStatus })
        .eq("id", withdrawal.id)
        .in("status", ["otp", "processing", "queued"])
        .select("id,status").maybeSingle();
      if (updateError || !updatedWithdrawal) {
        console.error("Could not update nonterminal transfer status:", updateError?.message || "withdrawal status changed concurrently");
        return json({
          verified: false,
          status: "pending_reconciliation",
          error: "Paystack returned a non-final status, but the database could not confirm the latest state. Funds remain reserved.",
        }, 202);
      }
      return json({
        verified: true,
        status: transferStatus,
        message: `Paystack reports ${transferStatus}. The withdrawal funds remain reserved.`,
      });
    }


    if (action === "overview") {
      const [walletResult, transactionResult, rewardResult, withdrawalResult, attributionResult, paymentResult, summaryResult] = await Promise.all([
        serviceClient.from("referral_wallets").select("user_id,pending_balance,available_balance,lifetime_earned,lifetime_paid,recovery_balance,updated_at").order("updated_at", { ascending: false }).limit(500),
        serviceClient.from("referral_wallet_transactions").select("id,user_id,transaction_type,amount,status,reference_type,reference_id,idempotency_key,description,created_at").order("created_at", { ascending: false }).limit(500),
        serviceClient.from("referral_rewards").select("id,payment_id,referrer_user_id,referred_user_id,amount,status,created_at,available_at,reversed_at").order("created_at", { ascending: false }).limit(500),
        serviceClient.from("referral_withdrawals").select("id,user_id,bank_account_id,amount,currency,status,reference,paystack_transfer_code,failure_reason,requested_at,completed_at,referral_bank_accounts(bank_name,account_name,account_number_masked)").order("requested_at", { ascending: false }).limit(500),
        serviceClient.from("referral_attributions").select("referred_user_id,referrer_user_id,referral_code,created_at").order("created_at", { ascending: false }).limit(500),
        serviceClient.from("payments").select("id,user_id,amount,refunded_amount_kobo,currency,status,payment_method,plan_id,reference,verified_at,created_at").in("status", ["success", "refunded"]).eq("payment_method", "paystack").eq("amount", 2500).eq("currency", "NGN").eq("plan_id", "lifetime_access").not("verified_at", "is", null).order("verified_at", { ascending: false }).limit(2000),
        serviceClient.rpc("get_referral_admin_summary", { p_actor_user_id: authData.user.id }),
      ]);
      const failure = walletResult.error || transactionResult.error || rewardResult.error || withdrawalResult.error || attributionResult.error || paymentResult.error || summaryResult.error;
      if (failure) {
        console.error("Referral financial overview failed:", failure.message);
        return json({ error: "Could not load the complete referral financial overview." }, 500);
      }
      if (!summaryResult.data?.summary || !Array.isArray(summaryResult.data.monthly_referral_performance)) {
        console.error("Referral financial summary returned an invalid response.");
        return json({ error: "Could not load the complete referral financial overview." }, 500);
      }
      const walletRows = (walletResult.data || []) as ReferralWalletRow[];
      const transactionRows = (transactionResult.data || []) as ReferralTransactionRow[];
      const rewardRows = (rewardResult.data || []) as ReferralRewardRow[];
      const withdrawalRows = (withdrawalResult.data || []) as ReferralWithdrawalRow[];
      const attributionRows = (attributionResult.data || []) as ReferralAttributionRow[];
      const paymentRows = (paymentResult.data || []) as PaymentRow[];
      const paymentUserIds = [...new Set(paymentRows.map((row) => row.user_id))];
      const paymentUserIdChunks: string[][] = [];
      for (let offset = 0; offset < paymentUserIds.length; offset += 500) {
        paymentUserIdChunks.push(paymentUserIds.slice(offset, offset + 500));
      }
      const displayedAttributionResults = await Promise.all(paymentUserIdChunks.map((ids) =>
        serviceClient.from("referral_attributions")
          .select("referred_user_id,referrer_user_id,referral_code,created_at")
          .in("referred_user_id", ids)
      ));
      const displayedAttributionError = displayedAttributionResults.find((result) => result.error)?.error;
      if (displayedAttributionError) {
        console.error("Could not load referred payment attribution:", displayedAttributionError.message);
        return json({ error: "Referred payment details could not be loaded." }, 500);
      }
      const displayedAttributions = displayedAttributionResults.flatMap((result) =>
        (result.data || []) as ReferralAttributionRow[]
      );
      const ids = [...new Set([
        ...walletRows.map((row) => row.user_id),
        ...transactionRows.map((row) => row.user_id),
        ...rewardRows.flatMap((row) => [row.referrer_user_id, row.referred_user_id]),
        ...withdrawalRows.map((row) => row.user_id),
        ...attributionRows.flatMap((row) => [row.referrer_user_id, row.referred_user_id]),
        ...displayedAttributions.flatMap((row) => [row.referrer_user_id, row.referred_user_id]),
        ...paymentRows.map((row) => row.user_id),
      ])];
      const { data: profiles, error: profilesError } = ids.length
        ? await serviceClient.from("profiles").select("user_id,full_name,email,is_subscribed").in("user_id", ids)
        : { data: [] as ProfileRow[], error: null };
      if (profilesError) return json({ error: "Customer details could not be loaded." }, 500);
      const { data: referralProfiles, error: referralProfilesError } = ids.length
        ? await serviceClient.from("referral_profiles").select("user_id,referral_code,withdrawals_blocked,withdrawals_block_reason,withdrawals_block_source").in("user_id", ids)
        : { data: [] as ReferralProfileRow[], error: null };
      if (referralProfilesError) return json({ error: "Referral account controls could not be loaded." }, 500);
      const paymentIds = [...new Set(rewardRows.map((row) => row.payment_id))];
      const { data: payments, error: paymentsError } = paymentIds.length
        ? await serviceClient.from("payments").select("id,reference,amount,status,verified_at").in("id", paymentIds)
        : { data: [] as PaymentDetailsRow[], error: null };
      if (paymentsError) return json({ error: "Referral subscription payment details could not be loaded." }, 500);
      const paymentRowsForRewards = (payments || []) as PaymentDetailsRow[];
      const profileRows = (profiles || []) as ProfileRow[];
      const referralProfileRows = (referralProfiles || []) as ReferralProfileRow[];
      const paymentMap = new Map(paymentRowsForRewards.map((row) => [row.id, row] as const));
      const profileMap = new Map(profileRows.map((row) => [row.user_id, row] as const));
      const referralMap = new Map(referralProfileRows.map((row) => [row.user_id, row] as const));
      const enrich = <T extends { user_id: string }>(row: T) => ({
        ...row,
        customer_name: profileMap.get(row.user_id)?.full_name || "Customer",
        customer_email: profileMap.get(row.user_id)?.email || "",
      });
      const wallets = walletRows.map((row) => ({
        ...enrich(row),
        is_subscribed: profileMap.get(row.user_id)?.is_subscribed === true,
        referral_code: referralMap.get(row.user_id)?.referral_code || null,
        withdrawals_blocked: referralMap.get(row.user_id)?.withdrawals_blocked === true,
        withdrawals_block_reason: referralMap.get(row.user_id)?.withdrawals_block_reason || null,
      }));
      const transactions = transactionRows.map((row) => enrich(row));
      const rewards = rewardRows.map((row) => ({
        ...row,
        referrer_name: profileMap.get(row.referrer_user_id)?.full_name || "Customer",
        referrer_email: profileMap.get(row.referrer_user_id)?.email || "",
        referred_name: profileMap.get(row.referred_user_id)?.full_name || "Customer",
        referred_email: profileMap.get(row.referred_user_id)?.email || "",
        payment_reference: paymentMap.get(row.payment_id)?.reference || "",
        payment_amount: paymentMap.get(row.payment_id)?.amount || 0,
        payment_status: paymentMap.get(row.payment_id)?.status || "unknown",
        payment_verified_at: paymentMap.get(row.payment_id)?.verified_at || null,
      }));
      const withdrawals = withdrawalRows.map((row) => ({
        ...enrich(row),
        bank: Array.isArray(row.referral_bank_accounts) ? row.referral_bank_accounts[0] : row.referral_bank_accounts,
      }));
      const referralPayments = paymentRows.filter((payment) =>
        displayedAttributions.some((attribution) => attribution.referred_user_id === payment.user_id)
      );
      const displayedPaymentIds = referralPayments.map((payment) => payment.id);
      const displayedPaymentIdChunks: string[][] = [];
      for (let offset = 0; offset < displayedPaymentIds.length; offset += 500) {
        displayedPaymentIdChunks.push(displayedPaymentIds.slice(offset, offset + 500));
      }
      const displayedRewardResults = await Promise.all(displayedPaymentIdChunks.map((ids) =>
        serviceClient.from("referral_rewards").select("payment_id")
          .in("payment_id", ids).neq("status", "reversed")
      ));
      const displayedRewardError = displayedRewardResults.find((result) => result.error)?.error;
      if (displayedRewardError) {
        console.error("Could not load referral reward statuses:", displayedRewardError.message);
        return json({ error: "Referral payment reward statuses could not be loaded." }, 500);
      }
      const rewardedPaymentIds = new Set(
        displayedRewardResults.flatMap((result) => (result.data || []).map((reward) => reward.payment_id)),
      );
      const referralPaymentsEnriched = referralPayments.map((payment) => {
        const attribution = displayedAttributions.find((item) => item.referred_user_id === payment.user_id);
        const grossAmount = Number(payment.amount);
        const refundAmount = Number(payment.refunded_amount_kobo || 0) / 100;
        return {
          ...payment,
          gross_amount: grossAmount,
          refund_amount: refundAmount,
          net_amount: grossAmount - refundAmount,
          customer_name: profileMap.get(payment.user_id)?.full_name || "Customer",
          customer_email: profileMap.get(payment.user_id)?.email || "",
          referrer_name: attribution ? profileMap.get(attribution.referrer_user_id)?.full_name || "Referrer" : "Unknown",
          reward_credited: rewardedPaymentIds.has(payment.id),
        };
      });
      return json({
        summary: summaryResult.data.summary,
        wallets, transactions, rewards, withdrawals,
        referral_payments: referralPaymentsEnriched,
        monthly_referral_performance: summaryResult.data.monthly_referral_performance,
        attributions: attributionResult.data || [],
        detail_records_limited: true,
      });
    }

    if (action === "find_customer") {
      const query = typeof body?.query === "string" ? body.query.trim().slice(0, 120) : "";
      // Plain text searches customer names only. Search email addresses when
      // the user enters an email-style query containing "@", avoiding matches
      // where a name search happens to appear inside an unrelated email.
      const safeQuery = query.replace(/[%,_()]/g, "").trim();
      if (safeQuery.length < 3) return json({ error: "Enter at least 3 valid characters to search." }, 400);
      const isEmailSearch = safeQuery.includes("@");
      const column = isEmailSearch ? "email" : "full_name";
      const { data: matches, error: searchError } = await serviceClient
        .from("profiles").select("user_id,full_name,email")
        .ilike(column, `%${safeQuery}%`).limit(50);
      if (searchError) {
        console.error("Referral customer search failed:", searchError.message);
        return json({ error: "Customer search is temporarily unavailable." }, 500);
      }
      const profiles = (matches || []) as ProfileRow[];
      const userIds = profiles.map((profile) => profile.user_id);
      const { data: controls, error: controlsError } = userIds.length
        ? await serviceClient.from("referral_profiles")
            .select("user_id,withdrawals_blocked,withdrawals_block_reason")
            .in("user_id", userIds)
        : { data: [] as WithdrawalControlRow[], error: null };
      if (controlsError) return json({ error: "Customer withdrawal controls could not be loaded." }, 500);
      const controlRows = (controls || []) as WithdrawalControlRow[];
      const controlMap = new Map(controlRows.map((control) => [control.user_id, control] as const));
      return json({ customers: profiles.map((profile) => ({
        ...profile,
        withdrawals_blocked: controlMap.get(profile.user_id)?.withdrawals_blocked === true,
        withdrawals_block_reason: controlMap.get(profile.user_id)?.withdrawals_block_reason || null,
        has_referral_profile: controlMap.has(profile.user_id),
      })) });
    }

    if (action === "set_withdrawal_block") {
      const targetUserId = typeof body?.user_id === "string" ? body.user_id : "";
      const blocked = body?.blocked === true;
      const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
      if (!targetUserId) return json({ error: "Select a customer account." }, 400);
      if (blocked && reason.length < 5) return json({ error: "Enter a clear reason of at least 5 characters before blocking withdrawals." }, 400);

      const { data: target, error: targetError } = await serviceClient
        .from("referral_profiles").select("user_id").eq("user_id", targetUserId).maybeSingle();
      if (targetError || !target) return json({ error: "Referral customer account was not found." }, 404);

      const { data: controlResult, error: controlError } = await serviceClient.rpc("set_referral_withdrawal_block", {
        p_actor_user_id: authData.user.id,
        p_target_user_id: targetUserId,
        p_blocked: blocked,
        p_reason: blocked ? reason : null,
      });
      if (controlError || !controlResult?.updated) {
        console.error("Could not update referral withdrawal restriction:", controlError?.message || controlResult);
        return json({ error: controlError?.message || "Could not update this customer's withdrawal access." }, 500);
      }
      return json({ updated: true, blocked, message: blocked
        ? "Withdrawals are now blocked for this customer. Their earned balance remains untouched."
        : "Withdrawals are now enabled for this customer." });
    }

    if (action === "get_withdrawal_control") {
      const targetUserId = typeof body?.user_id === "string" ? body.user_id : "";
      if (!targetUserId) return json({ error: "Select a customer account." }, 400);
      const { data: control, error: controlError } = await serviceClient.from("referral_profiles")
        .select("user_id,withdrawals_blocked,withdrawals_block_reason,withdrawals_blocked_at")
        .eq("user_id", targetUserId).maybeSingle();
      if (controlError || !control) return json({ error: "Customer withdrawal controls could not be loaded." }, 404);
      return json({ control });
    }

    if (action === "finalize_otp") {
      const withdrawalId = typeof body?.withdrawal_id === "string" ? body.withdrawal_id : "";
      const otp = typeof body?.otp === "string" ? body.otp.trim() : "";
      if (!withdrawalId || !/^\d{4,8}$/.test(otp)) {
        return json({ error: "Enter the transfer authorisation code Paystack sent to the business contact." }, 400);
      }

      const { data: withdrawal, error: lookupError } = await serviceClient.from("referral_withdrawals")
        .select("id,status,reference,paystack_transfer_code,amount")
        .eq("id", withdrawalId).maybeSingle();
      if (lookupError || !withdrawal) return json({ error: "Withdrawal request was not found." }, 404);
      if (withdrawal.status !== "otp" || !withdrawal.paystack_transfer_code) {
        return json({ error: "This withdrawal is not waiting for OTP approval. Refresh the list and check its latest status." }, 409);
      }

      const response = await fetch("https://api.paystack.co/transfer/finalize_transfer", {
        method: "POST",
        headers: { Authorization: `Bearer ${paystackSecret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ transfer_code: withdrawal.paystack_transfer_code, otp }),
        signal: AbortSignal.timeout(30000),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.status !== true) {
        const message = String(payload?.message || "Paystack could not approve this transfer.");
        console.warn("Paystack did not confirm OTP finalization; funds remain reserved:", {
          reference: withdrawal.reference,
          httpStatus: response.status,
          message,
        });
        return json({
          error: message,
          pending_reconciliation: true,
          warning: "Paystack did not confirm the transfer outcome. The reserved balance has not been released; check the transfer status before retrying.",
        }, response.status >= 500 || response.status === 401 || response.status === 429 ? 502 : 400);
      }

      const transferStatus = String(payload?.data?.status || "").toLowerCase();
      if (transferStatus === "success" || transferStatus === "failed" || transferStatus === "reversed") {
        const { data: settlement, error: settlementError } = await serviceClient.rpc("settle_referral_withdrawal", {
          p_reference: withdrawal.reference,
          p_outcome: transferStatus,
          p_transfer_code: withdrawal.paystack_transfer_code,
          p_failure_reason: payload?.message || "Paystack could not complete the transfer.",
        });
        const settlementRecorded = !settlementError &&
          isTransferSettlementRecorded(settlement, transferStatus);
        if (!settlementRecorded) {
          console.error("Paystack reported a terminal transfer outcome but settlement was not confirmed:", {
            reference: withdrawal.reference,
            settlementError: settlementError?.message,
            settlement,
          });
          return json({
            finalized: false,
            status: "pending_reconciliation",
            reference: withdrawal.reference,
            warning: "Paystack reported a transfer outcome, but wallet settlement could not be confirmed. The request remains under review.",
          }, 202);
        }
        return json({
          finalized: transferStatus === "success",
          status: transferStatus,
          reference: withdrawal.reference,
          message: transferStatus === "success"
            ? "Paystack confirmed the transfer and wallet settlement was recorded."
            : "Paystack confirmed the transfer did not complete and wallet settlement was recorded.",
        }, transferStatus === "success" ? 200 : 409);
      }

      const { data: savedWithdrawal, error: updateError } = await serviceClient.from("referral_withdrawals")
        .update({ status: "processing" }).eq("id", withdrawal.id).eq("status", "otp")
        .select("id,status").maybeSingle();
      if (updateError || !savedWithdrawal) {
        console.error("Could not update finalized referral withdrawal:", updateError?.message);
        const { data: currentWithdrawal, error: currentError } = await serviceClient.from("referral_withdrawals")
          .select("status").eq("id", withdrawal.id).maybeSingle();
        return json({
          finalized: true,
          status: currentError || !currentWithdrawal ? "pending_reconciliation" : currentWithdrawal.status,
          reference: withdrawal.reference,
          pending_reconciliation: true,
          warning: "Paystack accepted the OTP, but the database status could not be confirmed. Do not submit another withdrawal.",
        }, 202);
      }
      return json({
        finalized: true,
        status: savedWithdrawal.status,
        message: "Transfer authorisation accepted. Paystack is processing the payout; the customer will be notified when it is confirmed.",
      });
    }

    return json({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("Referral payout administration failed:", error);
    return json({ error: "Referral payout administration is temporarily unavailable." }, 500);
  }
});
