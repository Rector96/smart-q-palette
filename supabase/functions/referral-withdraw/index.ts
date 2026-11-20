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
    if (String(bank.paystack_recipient_code || "").startsWith("TEST:")) {
      return json({
        accepted: false,
        test_account: true,
        error: "This is a Paystack test account. It lets you test bank setup only; withdrawals are disabled for test accounts. Add a real verified bank account after switching to live mode.",
      }, 400);
    }

    reservedReference = `SQPRWD-${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`;
    const { data: reservation, error: reserveError } = await serviceClient.rpc("reserve_referral_withdrawal", {
      p_user_id: userId,
      p_bank_account_id: bankAccountId,
      p_amount: amount,
      p_reference: reservedReference,
    });
    if (reserveError || !reservation?.withdrawal_id) {
      return json({ error: reserveError?.message || "We could not reserve this withdrawal." }, 409);
    }

    const transferResponse = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: { Authorization: `Bearer ${paystackSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "balance",
        amount: amount * 100,
        recipient: bank.paystack_recipient_code,
        reason: "Smart Q Palette referral reward withdrawal",
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
    const { error: updateError } = await serviceClient.from("referral_withdrawals").update({
      status: "processing",
      paystack_transfer_code: transfer.transfer_code || null,
    }).eq("id", reservation.withdrawal_id).eq("status", "queued");

    if (updateError) {
      // Paystack has accepted the transfer. Do not release funds here: the webhook
      // is authoritative and will settle this reference when Paystack reports outcome.
      console.error("Transfer accepted but withdrawal status update failed:", updateError.message);
    }

    return json({
      accepted: true,
      status: "processing",
      reference: reservedReference,
      message: "Your withdrawal request has been sent to Paystack. We will update its status when the transfer is confirmed.",
    });
  } catch (error) {
    console.error("Referral withdrawal failed:", error);
    // A reserved transfer is released only after a definitive Paystack rejection.
    return json({ error: error instanceof Error ? error.message : "Withdrawal could not be processed." }, 500);
  }
});
