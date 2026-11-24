import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!secret || !supabaseUrl || !anonKey || !serviceKey) {
      console.error("Payment verification is missing a required server secret.");
      return json({ error: "Payment verification is temporarily unavailable. Please contact support." }, 503);
    }

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token || token === authHeader) return json({ error: "Please sign in to verify this payment." }, 401);

    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: authHeader! } } });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) return json({ error: "Your session could not be verified. Please sign in again." }, 401);

    const userId = String(claimsData.claims.sub);
    const userEmail = String(claimsData.claims.email || "").toLowerCase();
    const body = await req.json().catch(() => ({}));
    const reference = typeof body?.reference === "string" ? body.reference.trim() : "";
    if (!reference || reference.length > 100) return json({ error: "A valid payment reference is required." }, 400);

    const serviceClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: payment, error: paymentError } = await serviceClient.from("payments")
      .select("id, user_id, amount, currency, status, plan_id")
      .eq("reference", reference).eq("user_id", userId).maybeSingle();
    if (paymentError) {
      console.error("Could not find pending payment:", paymentError.message);
      return json({ error: "We could not locate this payment. Contact support with your reference." }, 500);
    }
    if (!payment) return json({ status: "failed", message: "This payment reference does not belong to your account." }, 404);

    if (payment.status === "success") {
      const { data: confirmation, error: confirmationError } = await serviceClient.rpc(
        "confirm_paystack_payment",
        {
          p_payment_reference: reference,
          p_amount_kobo: Math.round(Number(payment.amount) * 100),
          p_currency: payment.currency,
        },
      );
      if (confirmationError) {
        console.error("Could not confirm existing payment atomically:", confirmationError.message);
        return json({ error: "Payment confirmation is still processing. Please refresh shortly." }, 500);
      }
      if (confirmation?.confirmed !== true) {
        return json({ status: "failed", message: "This payment cannot activate access because it is refunded or no longer eligible." }, 409);
      }
      return json({ status: "success", message: "Payment verified and Pro access activated." });
    }

    if (payment.status !== "pending") return json({ status: "failed", message: "This payment is not awaiting verification." }, 409);

    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok || verifyData?.status !== true) {
      console.error("Paystack verification request failed:", verifyData?.message || verifyRes.status);
      return json({ error: "Paystack could not verify the payment right now. Please try again." }, 502);
    }

    const transaction = verifyData.data;
    if (transaction?.status !== "success") return json({ status: "failed", message: "Paystack has not confirmed a successful payment." });
    const expectedAmount = Math.round(Number(payment.amount) * 100);
    const verifiedRequestedAmount = Number(transaction.requested_amount ?? transaction.amount);
    if (
      transaction.reference !== reference ||
      !Number.isSafeInteger(expectedAmount) ||
      !Number.isSafeInteger(verifiedRequestedAmount) ||
      verifiedRequestedAmount !== expectedAmount ||
      String(transaction.currency || "").toUpperCase() !== String(payment.currency || "").toUpperCase() ||
      String(payment.currency || "").toUpperCase() !== "NGN"
    ) {
      console.error("Payment verification mismatch for reference:", reference);
      return json({ status: "failed", message: "The payment details do not match this order. Please contact support." }, 400);
    }
    const paidEmail = String(transaction.customer?.email || "").toLowerCase();
    if (userEmail && paidEmail && userEmail !== paidEmail) {
      return json({ status: "failed", message: "The payer email does not match the signed-in account." }, 400);
    }

    const { data: confirmation, error: confirmationError } = await serviceClient.rpc(
      "confirm_paystack_payment",
      {
        p_payment_reference: reference,
        p_amount_kobo: verifiedRequestedAmount,
        p_currency: "NGN",
      },
    );
    if (confirmationError) {
      console.error("Could not atomically confirm verified payment:", confirmationError.message);
      return json({ error: "Your payment was verified but account activation is still processing. Please refresh shortly." }, 500);
    }
    if (confirmation?.confirmed !== true) {
      return json({ status: "failed", message: "This payment cannot activate access because it is refunded or no longer eligible." }, 409);
    }
    return json({ status: "success", message: "Payment verified and Pro access activated." });
  } catch (error: unknown) {
    console.error("Payment verification error:", error);
    return json({ error: "We could not verify the payment. Please try again." }, 500);
  }
});
