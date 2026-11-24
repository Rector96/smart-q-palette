import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});

const constantTimeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
};

const hmacHex = async (secret: string, message: string) => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const verifySignature = async (rawBody: string, req: Request) => {
  const modernHeader = req.headers.get("paystack-signature");
  if (modernHeader) {
    const webhookSecret = Deno.env.get("PAYSTACK_WEBHOOK_SECRET");
    if (!webhookSecret) return false;
    const fields = modernHeader.split(",").map((part) => part.trim().split("=", 2));
    const timestampValue = fields.find(([key]) => key === "t")?.[1];
    const timestamp = Number(timestampValue);
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
    const signatures = fields.filter(([key]) => key === "v1").map(([, value]) => value || "");
    const expected = await hmacHex(webhookSecret, `${timestamp}.${rawBody}`);
    return signatures.some((entry) => {
      const separator = entry.indexOf(":");
      const hex = separator >= 0 ? entry.slice(separator + 1) : entry;
      return /^[0-9a-f]{128}$/.test(hex) && constantTimeEqual(expected, hex);
    });
  }

  const legacyHeader = req.headers.get("x-paystack-signature");
  const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!legacyHeader || !paystackSecret || !/^[0-9a-f]{128}$/.test(legacyHeader)) return false;
  const expected = await hmacHex(paystackSecret, rawBody);
  return constantTimeEqual(expected, legacyHeader);
};

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const rawBody = await req.text();
    if (!(await verifySignature(rawBody, req))) return json({ error: "Invalid or missing Paystack signature." }, 401);

    const event = JSON.parse(rawBody);

    // Reconcile outbound referral transfers from Paystack's signed webhook.
    const transferEvents: Record<string, "success" | "failed" | "reversed"> = {
      "transfer.success": "success",
      "transfer.failed": "failed",
      "transfer.reversed": "reversed",
    };
    const transferOutcome = transferEvents[event?.event];
    if (transferOutcome) {
      const transfer = event?.data || {};
      const transferReference = typeof transfer.reference === "string" ? transfer.reference : "";
      if (!transferReference) return json({ error: "Transfer reference is missing." }, 400);

      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceKey) return json({ error: "Webhook is temporarily unavailable." }, 503);
      const serviceClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: settlement, error: settlementError } = await serviceClient.rpc("settle_referral_withdrawal", {
        p_reference: transferReference,
        p_outcome: transferOutcome,
        p_transfer_code: typeof transfer.transfer_code === "string" ? transfer.transfer_code : null,
        p_failure_reason: typeof transfer.reason === "string" ? transfer.reason : null,
      });
      if (settlementError) {
        console.error("Referral transfer settlement failed:", settlementError.message);
        return json({ error: "Transfer outcome could not be recorded." }, 500);
      }
      console.info("Referral transfer webhook processed:", transferReference, settlement);
      return json({ received: true });
    }


    if (event?.event === "refund.processed") {
      const refund = event?.data || {};
      const paymentReference = typeof refund.transaction_reference === "string" ? refund.transaction_reference : "";
      const refundId = refund.id === undefined || refund.id === null ? "" : String(refund.id);
      const refundAmount = Number(refund.amount);
      if (!paymentReference || !refundId || !Number.isSafeInteger(refundAmount) || refundAmount <= 0 || refund.currency !== "NGN") {
        return json({ error: "Refund details are incomplete or invalid." }, 400);
      }
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceKey) return json({ error: "Webhook is temporarily unavailable." }, 503);
      const serviceClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: refundResult, error: refundError } = await serviceClient.rpc("record_paystack_refund", {
        p_payment_reference: paymentReference,
        p_provider_refund_id: refundId,
        p_refund_amount_kobo: refundAmount,
        p_currency: refund.currency,
      });
      if (refundError) {
        console.error("Paystack refund processing failed:", refundError.message);
        return json({ error: "Refund processing could not be recorded." }, 500);
      }
      if (!refundResult?.recorded) {
        const reason = refundResult?.reason || "refund_not_recorded";
        console.error("Paystack refund was not applied:", paymentReference, reason);
        return json({ error: "Refund could not be matched to an eligible payment.", reason }, 409);
      }
      console.info("Paystack refund event processed:", paymentReference, refundId, refundResult);
      return json({ received: true, refund: refundResult });
    }

    if (event?.event !== "charge.success") return json({ received: true });

    const transaction = event?.data;
    const reference = typeof transaction?.reference === "string" ? transaction.reference : "";
    if (!reference || transaction?.status !== "success" || transaction?.currency !== "NGN") {
      return json({ error: "Invalid successful-payment event." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      console.error("Paystack webhook is missing Supabase service configuration.");
      return json({ error: "Webhook is temporarily unavailable." }, 503);
    }
    const serviceClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: payment, error: lookupError } = await serviceClient.from("payments")
      .select("id, user_id, amount, currency, status")
      .eq("reference", reference).maybeSingle();
    if (lookupError) {
      console.error("Webhook payment lookup failed:", lookupError.message);
      return json({ error: "Payment lookup failed." }, 500);
    }
    if (!payment) {
      console.error("Webhook reference has no matching pending payment:", reference);
      return json({ error: "Unknown payment reference." }, 404);
    }

    const expectedAmount = Math.round(Number(payment.amount) * 100);
    if (payment.currency !== "NGN" || transaction.amount !== expectedAmount ||
        (transaction.metadata?.user_id && transaction.metadata.user_id !== payment.user_id)) {
      console.error("Webhook amount, currency or owner mismatch:", reference);
      return json({ error: "Payment details did not match the order." }, 400);
    }

    if (payment.status !== "success") {
      const { error: paymentUpdateError } = await serviceClient.from("payments").update({
        status: "success",
        paystack_reference: reference,
        verified_at: new Date().toISOString(),
      }).eq("id", payment.id);
      if (paymentUpdateError) {
        console.error("Webhook could not update payment:", paymentUpdateError.message);
        return json({ error: "Could not record payment." }, 500);
      }
    }

    // Credit a referral commission only after the matching payment is verified.
    // The database RPC is idempotent, so repeated Paystack webhooks cannot double-credit.
    const { data: referralResult, error: referralError } = await serviceClient.rpc(
      "credit_referral_reward",
      { p_payment_id: payment.id },
    );
    if (referralError) {
      console.error("Referral reward processing failed:", referralError.message);
      return json({ error: "Payment recorded; referral reward processing will retry." }, 500);
    }
    if (referralResult?.credited) {
      console.info("Referral reward credited:", referralResult.reward_id);
    }

    const { error: profileError } = await serviceClient.from("profiles")
      .update({ is_subscribed: true }).eq("user_id", payment.user_id);
    if (profileError) {
      console.error("Webhook could not activate customer:", profileError.message);
      return json({ error: "Could not activate customer access." }, 500);
    }
    return json({ received: true });
  } catch (error) {
    console.error("Paystack webhook processing failed:", error);
    return json({ error: "Webhook processing failed." }, 500);
  }
});
