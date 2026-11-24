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

    const activateAccount = async () => {
      const { error: profileError } = await serviceClient.from("profiles")
        .update({ is_subscribed: true }).eq("user_id", userId);
      if (profileError) {
        console.error("Payment verified but profile activation failed:", profileError.message);
        return false;
      }
      return true;
    };

    if (payment.status === "success") {
      const { error: referralError } = await serviceClient.rpc("credit_referral_reward", { p_payment_id: payment.id });
      if (referralError) {
        console.error("Referral reward processing failed:", referralError.message);
        return json({ error: "Payment confirmed; referral reward processing is still pending. Please refresh shortly." }, 500);
      }
      if (!(await activateAccount())) return json({ error: "Payment is confirmed, but account activation is still processing. Refresh shortly." }, 500);
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
    if (transaction.reference !== reference || transaction.amount !== expectedAmount || transaction.currency !== "NGN") {
      console.error("Payment verification mismatch for reference:", reference);
      return json({ status: "failed", message: "The payment details do not match this order. Please contact support." }, 400);
    }
    const paidEmail = String(transaction.customer?.email || "").toLowerCase();
    if (userEmail && paidEmail && userEmail !== paidEmail) {
      return json({ status: "failed", message: "The payer email does not match the signed-in account." }, 400);
    }

    const { data: transitionedPayment, error: updateError } = await serviceClient.from("payments").update({
      status: "success",
      paystack_reference: reference,
      verified_at: new Date().toISOString(),
    }).eq("id", payment.id).eq("user_id", userId).eq("status", "pending")
      .select("id").maybeSingle();
    if (updateError) {
      console.error("Could not mark verified payment successful:", updateError.message);
      return json({ error: "Your payment was verified but account activation is still processing. Please refresh shortly." }, 500);
    }
    if (!transitionedPayment) {
      // A webhook or another verification request may have won the race.
      const { data: latestPayment, error: latestError } = await serviceClient.from("payments")
        .select("status").eq("id", payment.id).eq("user_id", userId).maybeSingle();
      if (latestError || latestPayment?.status !== "success") {
        return json({ error: "This payment is no longer awaiting verification. Contact support if you were charged." }, 409);
      }
    }

    if (!(await activateAccount())) return json({ error: "Payment is confirmed, but account activation is still processing. Refresh shortly." }, 500);
    const { error: referralError } = await serviceClient.rpc("credit_referral_reward", { p_payment_id: payment.id });
    if (referralError) {
      console.error("Referral reward processing failed:", referralError.message);
      return json({ error: "Payment confirmed; referral reward processing is still pending. Please refresh shortly." }, 500);
    }
    return json({ status: "success", message: "Payment verified and Pro access activated." });
  } catch (error: unknown) {
    console.error("Payment verification error:", error);
    return json({ error: "We could not verify the payment. Please try again." }, 500);
  }
});
