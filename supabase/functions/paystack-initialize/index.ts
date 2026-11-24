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
const PRO_PRICE_KOBO = 250000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!secret || !supabaseUrl || !anonKey || !serviceKey) {
      console.error("Payment initialization is missing a required server secret.");
      return json({ error: "Payments are temporarily unavailable. Please contact support." }, 503);
    }

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (!token || token === authHeader) return json({ error: "Please sign in before making a payment." }, 401);

    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: authHeader! } } });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub || !claimsData.claims.email) return json({ error: "Your session could not be verified. Please sign in again." }, 401);

    const userId = String(claimsData.claims.sub);
    const userEmail = String(claimsData.claims.email);
    const serviceClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const reference = `SQP_${crypto.randomUUID().replace(/-/g, "")}`;

    // Pending payments are created with the service role because browser-side payment writes are intentionally blocked by RLS.
    const { data: payment, error: insertError } = await serviceClient.from("payments").insert({
      user_id: userId,
      amount: PRO_PRICE_KOBO / 100,
      currency: "NGN",
      reference,
      payment_method: "paystack",
      status: "pending",
      plan_id: "lifetime_access",
    }).select("id").single();
    if (insertError || !payment) {
      console.error("Could not create pending payment:", insertError?.message);
      return json({ error: "We could not prepare your payment. Please try again." }, 500);
    }

    const origin = req.headers.get("origin");
    const callbackUrl = origin ? `${origin.replace(/\/$/, "")}/dashboard?payment=verify` : undefined;
    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: userEmail,
        amount: PRO_PRICE_KOBO,
        currency: "NGN",
        reference,
        callback_url: callbackUrl,
        metadata: { user_id: userId, payment_id: payment.id, plan_id: "lifetime_access" },
      }),
    });

    const paystackData = await paystackRes.json();
    if (!paystackRes.ok || paystackData?.status !== true || !paystackData?.data?.authorization_url) {
      // Do not overwrite a success already recorded by a fast webhook.
      const { error: failUpdateError } = await serviceClient.from("payments")
        .update({ status: "failed" })
        .eq("id", payment.id)
        .eq("user_id", userId)
        .eq("status", "pending");
      if (failUpdateError) {
        console.error("Could not mark rejected initialization as failed:", failUpdateError.message);
      }
      console.error("Paystack initialization rejected:", paystackData?.message || paystackRes.status);
      return json({ error: paystackData?.message || "Paystack could not start your payment. Please try again." }, 502);
    }

    return json({ status: true, data: { authorization_url: paystackData.data.authorization_url, reference } });
  } catch (error: unknown) {
    console.error("Payment initialization error:", error);
    return json({ error: "We could not start the payment. Please try again." }, 500);
  }
});
