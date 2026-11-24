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

  let reservedReference = "";
  let reservationCreated = false;
  let serviceClient: ReturnType<typeof createClient> | null = null;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey || !paystackSecret) {
      return json({ error: "Withdrawals are not configured yet." }, 503);
    }

    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token || token === authorization) return json({ error: "Please sign in first." }, 401);

    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Your session has expired. Please sign in again." }, 401);
    const userId = authData.user.id;

    const body = await req.json().catch(() => ({}));
    const amount = Number(body?.amount);
    const bankAccountId = typeof body?.bank_account_id === "string" ? body.bank_account_id : "";
    if (!Number.isSafeInteger(amount) || amount < 1000 || !bankAccountId) {
      return json({ error: "Enter a whole-naira withdrawal amount of at least ₦1,000." }, 400);
    }

    serviceClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: bank, error: bankError } = await serviceClient.from("referral_bank_accounts")
      .select("id,paystack_recipient_code,account_name,bank_name,account_number_masked")
      .eq("id", bankAccountId).eq("user_id", userId).eq("is_verified", true).maybeSingle();
    if (bankError || !bank) return json({ error: "Choose one of your verified bank accounts." }, 400);

    const storedRecipientCode = String(bank.paystack_recipient_code || "");
    const isTestRecipient = storedRecipientCode.startsWith("TEST:");
    const isTestSecret = paystackSecret.startsWith("sk_test_");
    if (isTestRecipient && !isTestSecret) {
      return json({ accepted: false, test_account: true, error: "This test recipient can only be used with Paystack test keys." }, 400);
    }
    const recipientCode = isTestRecipient ? storedRecipientCode.slice(5) : storedRecipientCode;
    if (!recipientCode.startsWith("RCP_")) {
      return json({ error: "The saved bank recipient is invalid. Please add and verify the bank account again." }, 400);
    }

    reservedReference = `SQPRWD-${crypto.randomUUID().replaceAll("-", "").toLowerCase()}`;
    const { data: reservation, error: reserveError } = await serviceClient.rpc("reserve_referral_withdrawal", {
      p_user_id: userId,
      p_bank_account_id: bankAccountId,
      p_amount: amount,
      p_reference: reservedReference,
    });
    if (reserveError || !reservation?.withdrawal_id) {
      return json({ error: reserveError?.message || "We could not reserve this withdrawal." }, 409);
    }
    reservationCreated = true;

    const transferResponse = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: { Authorization: `Bearer ${paystackSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "balance",
        amount: amount * 100,
        recipient: recipientCode,
        reason: "ROCKCBT referral reward withdrawal",
        reference: reservedReference,
      }),
    });
    const transferPayload = await transferResponse.json().catch(() => ({}));
    if (!transferResponse.ok || transferPayload?.status !== true) {
      const reason = String(transferPayload?.message || "Paystack did not accept the transfer.");
      await serviceClient.rpc("settle_referral_withdrawal", {
        p_reference: reservedReference,
        p_outcome: "failed",
        p_failure_reason: reason,
      });
      return json({ error: reason }, 502);
    }

    const transfer = transferPayload.data || {};
    const paystackStatus = String(transfer.status || "").toLowerCase();

    // OTP approval has been disabled in the Paystack dashboard. If Paystack
    // still returns an OTP-required transfer, do not leave customer funds
    // reserved in an unattended approval queue. Fail safely and restore balance.
    if (paystackStatus === "otp") {
      await serviceClient.rpc("settle_referral_withdrawal", {
        p_reference: reservedReference,
        p_outcome: "failed",
        p_transfer_code: typeof transfer.transfer_code === "string" ? transfer.transfer_code : null,
        p_failure_reason: "Paystack still requires transfer OTP approval. Check Paystack transfer approval preferences.",
      });
      return json({ accepted: false, otp_required: true,
        error: "Paystack is still requesting approval for this transfer. Your withdrawal balance has been restored. Please contact support; do not submit repeated requests." }, 409);
    }

    const nextStatus = "processing";
    const { error: updateError } = await serviceClient.from("referral_withdrawals").update({
      status: nextStatus,
      paystack_transfer_code: transfer.transfer_code || null,
    }).eq("id", reservation.withdrawal_id).eq("status", "queued");

    if (updateError) {
      console.error("Transfer accepted but withdrawal status update failed:", updateError.message);
      return json({ accepted: true, status: nextStatus, reference: reservedReference,
        warning: "Paystack accepted the request, but its status could not be saved. Contact platform support before retrying." });
    }

    return json({
      accepted: true,
      status: nextStatus,
      test_mode: isTestSecret,
      reference: reservedReference,
      amount,
      bank: { bank_name: bank.bank_name, account_name: bank.account_name, account_number_masked: bank.account_number_masked },
      message: isTestSecret
        ? "Your test withdrawal was accepted. This is a simulation; no real money will be sent."
        : "Your withdrawal request has been sent to Paystack. We will update its status when the transfer is confirmed.",
    });
  } catch (error) {
    console.error("Referral withdrawal failed:", error);
    if (reservationCreated && reservedReference) {
      // A network exception after reservation is ambiguous: Paystack may have
      // accepted the transfer. Keep funds reserved until the signed webhook or
      // an operator reconciliation confirms the actual transfer outcome.
      return json({
        accepted: false,
        status: "pending_reconciliation",
        reference: reservedReference,
        error: "We could not confirm Paystack's response. Your balance remains reserved while we verify the transfer. Do not submit another withdrawal; contact support with this reference if the status does not update.",
      }, 202);
    }
    return json({ error: error instanceof Error ? error.message : "Withdrawal could not be processed." }, 500);
  }
});
