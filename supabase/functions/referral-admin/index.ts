import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});

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
      const { data: rows, error } = await serviceClient.from("referral_withdrawals")
        .select("id,user_id,bank_account_id,amount,currency,status,reference,paystack_transfer_code,failure_reason,requested_at,completed_at,referral_bank_accounts(bank_name,account_name,account_number_masked)")
        .in("status", ["otp", "processing", "queued"])
        .order("requested_at", { ascending: false }).limit(100);
      if (error) {
        console.error("Could not list referral withdrawals:", error.message);
        return json({ error: "Could not load referral withdrawals." }, 500);
      }
      const userIds = [...new Set((rows || []).map((row: any) => row.user_id))];
      const { data: profiles } = userIds.length
        ? await serviceClient.from("profiles").select("user_id,full_name,email").in("user_id", userIds)
        : { data: [] as any[] };
      const profileMap = new Map((profiles || []).map((profile: any) => [profile.user_id, profile]));
      const withdrawals = (rows || []).map((row: any) => ({
        ...row,
        customer_name: profileMap.get(row.user_id)?.full_name || "Customer",
        customer_email: profileMap.get(row.user_id)?.email || "",
        bank: Array.isArray(row.referral_bank_accounts) ? row.referral_bank_accounts[0] : row.referral_bank_accounts,
      }));
      return json({ withdrawals });
    }



    if (action === "overview") {
      const [walletResult, transactionResult, rewardResult, withdrawalResult, attributionResult] = await Promise.all([
        serviceClient.from("referral_wallets").select("user_id,pending_balance,available_balance,lifetime_earned,lifetime_paid,recovery_balance,updated_at").order("updated_at", { ascending: false }).limit(500),
        serviceClient.from("referral_wallet_transactions").select("id,user_id,transaction_type,amount,status,reference_type,reference_id,idempotency_key,description,created_at").order("created_at", { ascending: false }).limit(500),
        serviceClient.from("referral_rewards").select("id,payment_id,referrer_user_id,referred_user_id,amount,status,created_at,available_at,reversed_at").order("created_at", { ascending: false }).limit(500),
        serviceClient.from("referral_withdrawals").select("id,user_id,bank_account_id,amount,currency,status,reference,paystack_transfer_code,failure_reason,requested_at,completed_at,referral_bank_accounts(bank_name,account_name,account_number_masked)").order("requested_at", { ascending: false }).limit(500),
        serviceClient.from("referral_attributions").select("referred_user_id,referrer_user_id,referral_code,created_at").order("created_at", { ascending: false }).limit(500),
      ]);
      const failure = walletResult.error || transactionResult.error || rewardResult.error || withdrawalResult.error || attributionResult.error;
      if (failure) {
        console.error("Referral financial overview failed:", failure.message);
        return json({ error: "Could not load the complete referral financial overview." }, 500);
      }
      const ids = [...new Set([
        ...(walletResult.data || []).map((r: any) => r.user_id),
        ...(transactionResult.data || []).map((r: any) => r.user_id),
        ...(rewardResult.data || []).flatMap((r: any) => [r.referrer_user_id, r.referred_user_id]),
        ...(withdrawalResult.data || []).map((r: any) => r.user_id),
        ...(attributionResult.data || []).flatMap((r: any) => [r.referrer_user_id, r.referred_user_id]),
      ].filter(Boolean))];
      const { data: profiles, error: profilesError } = ids.length
        ? await serviceClient.from("profiles").select("user_id,full_name,email,is_subscribed").in("user_id", ids)
        : { data: [], error: null };
      if (profilesError) return json({ error: "Customer details could not be loaded." }, 500);
      const { data: referralProfiles, error: referralProfilesError } = ids.length
        ? await serviceClient.from("referral_profiles").select("user_id,referral_code,withdrawals_blocked,withdrawals_block_reason,withdrawals_block_source").in("user_id", ids)
        : { data: [], error: null };
      if (referralProfilesError) return json({ error: "Referral account controls could not be loaded." }, 500);
      const paymentIds = [...new Set((rewardResult.data || []).map((r: any) => r.payment_id).filter(Boolean))];
      const { data: payments, error: paymentsError } = paymentIds.length
        ? await serviceClient.from("payments").select("id,reference,amount,status,verified_at").in("id", paymentIds)
        : { data: [], error: null };
      if (paymentsError) return json({ error: "Referral subscription payment details could not be loaded." }, 500);
      const paymentMap = new Map((payments || []).map((r: any) => [r.id, r]));
      const profileMap = new Map((profiles || []).map((r: any) => [r.user_id, r]));
      const referralMap = new Map((referralProfiles || []).map((r: any) => [r.user_id, r]));
      const enrich = (row: any, idField = "user_id") => ({
        ...row,
        customer_name: profileMap.get(row[idField])?.full_name || "Customer",
        customer_email: profileMap.get(row[idField])?.email || "",
      });
      const wallets = (walletResult.data || []).map((row: any) => ({
        ...enrich(row),
        is_subscribed: profileMap.get(row.user_id)?.is_subscribed === true,
        referral_code: referralMap.get(row.user_id)?.referral_code || null,
        withdrawals_blocked: referralMap.get(row.user_id)?.withdrawals_blocked === true,
        withdrawals_block_reason: referralMap.get(row.user_id)?.withdrawals_block_reason || null,
      }));
      const transactions = (transactionResult.data || []).map((row: any) => enrich(row));
      const rewards = (rewardResult.data || []).map((row: any) => ({
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
      const withdrawals = (withdrawalResult.data || []).map((row: any) => ({
        ...enrich(row),
        bank: Array.isArray(row.referral_bank_accounts) ? row.referral_bank_accounts[0] : row.referral_bank_accounts,
      }));
      const total = (key: string) => wallets.reduce((sum: number, row: any) => sum + Number(row[key] || 0), 0);
      return json({
        summary: {
          users: wallets.length,
          available_balance: total("available_balance"),
          pending_balance: total("pending_balance"),
          lifetime_earned: total("lifetime_earned"),
          lifetime_paid: total("lifetime_paid"),
          recovery_balance: total("recovery_balance"),
          rewards: rewards.length,
          withdrawals: withdrawals.length,
        },
        wallets, transactions, rewards, withdrawals,
        attributions: attributionResult.data || [],
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
      const profiles = matches || [];
      const userIds = profiles.map((profile: any) => profile.user_id);
      const { data: controls, error: controlsError } = userIds.length
        ? await serviceClient.from("referral_profiles")
            .select("user_id,withdrawals_blocked,withdrawals_block_reason")
            .in("user_id", userIds)
        : { data: [], error: null };
      if (controlsError) return json({ error: "Customer withdrawal controls could not be loaded." }, 500);
      const controlMap = new Map((controls || []).map((control: any) => [control.user_id, control]));
      return json({ customers: profiles.map((profile: any) => ({
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
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.status !== true) {
        const message = String(payload?.message || "Paystack could not approve this transfer.");
        // Paystack treats an incorrect OTP as a failed transfer. Release the
        // reserved wallet balance only for a definite client-side rejection.
        if (response.status >= 400 && response.status < 500 && response.status !== 401 && response.status !== 429) {
          await serviceClient.rpc("settle_referral_withdrawal", {
            p_reference: withdrawal.reference,
            p_outcome: "failed",
            p_transfer_code: withdrawal.paystack_transfer_code,
            p_failure_reason: message,
          });
        }
        return json({ error: message }, response.status >= 500 ? 502 : 400);
      }

      const transferStatus = String(payload?.data?.status || "").toLowerCase();
      if (transferStatus === "failed" || transferStatus === "reversed") {
        await serviceClient.rpc("settle_referral_withdrawal", {
          p_reference: withdrawal.reference,
          p_outcome: transferStatus,
          p_transfer_code: withdrawal.paystack_transfer_code,
          p_failure_reason: payload?.message || "Paystack could not complete the transfer.",
        });
        return json({ finalized: false, status: transferStatus, error: "Paystack did not queue the transfer. The reserved amount has been returned to the user's wallet." }, 400);
      }

      const { error: updateError } = await serviceClient.from("referral_withdrawals")
        .update({ status: "processing" }).eq("id", withdrawal.id).eq("status", "otp");
      if (updateError) {
        console.error("Could not update finalized referral withdrawal:", updateError.message);
        return json({ finalized: true, status: "processing", warning: "Paystack accepted the OTP, but the dashboard status needs refreshing." });
      }
      return json({
        finalized: true,
        status: "processing",
        message: "Transfer authorisation accepted. Paystack is processing the payout; the customer will be notified when it is confirmed.",
      });
    }

    return json({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("Referral payout administration failed:", error);
    return json({ error: "Referral payout administration is temporarily unavailable." }, 500);
  }
});
