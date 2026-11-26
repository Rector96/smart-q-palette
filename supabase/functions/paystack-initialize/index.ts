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

const serviceClient = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Reuse an existing pending payment instead of creating another one.
const { data: existingPayment, error: existingPaymentError } = await serviceClient
  .from("payments")
  .select("id, reference, paystack_authorization_url")
  .eq("user_id", userId)
  .eq("plan_id", "lifetime_access")
  .eq("payment_method", "paystack")
  .eq("status", "pending")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (existingPaymentError) {
  console.error("Could not check existing payment:", existingPaymentError.message);
  return json({ error: "We could not check your previous payment. Please try again." }, 500);
}

if (existingPayment) {
  if (existingPayment.paystack_authorization_url && existingPayment.reference) {
    return json({
      status: true,
      data: {
        authorization_url: existingPayment.paystack_authorization_url,
        reference: existingPayment.reference,
      },
    });
  }

  return json({
    error: "A previous payment attempt is still being checked. Please do not start another payment. Contact support with this reference.",
    reference: existingPayment.reference,
    pending_reconciliation: true,
  }, 202);
}

const reference = `SQP_${crypto.randomUUID().replace(/-/g, "")}`;

// Pending payments are created with the service role because browser-side payment writes are intentionally blocked by RLS.
const { data: payment, error: insertError } = await serviceClient
  .from("payments")
  .insert({
    user_id: userId,
    amount: PRO_PRICE_KOBO / 100,
    currency: "NGN",
    reference,
    payment_method: "paystack",
    status: "pending",
    plan_id: "lifetime_access",
  })
  .select("id")
  .single();

if (insertError || !payment) {
  // Another request may have created the pending payment simultaneously.
  if (insertError?.code === "23505") {
    const { data: racedPayment } = await serviceClient
      .from("payments")
      .select("reference, paystack_authorization_url")
      .eq("user_id", userId)
      .eq("plan_id", "lifetime_access")
      .eq("payment_method", "paystack")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (racedPayment) {
      if (racedPayment.paystack_authorization_url && racedPayment.reference) {
        return json({
          status: true,
          data: {
            authorization_url: racedPayment.paystack_authorization_url,
            reference: racedPayment.reference,
          },
        });
      }

      return json({
        error: "A previous payment attempt is still being checked. Please do not start another payment. Contact support with this reference.",
        reference: racedPayment.reference,
        pending_reconciliation: true,
      }, 202);
    }
  }

  console.error("Could not create pending payment:", insertError?.message);
  return json({ error: "We could not prepare your payment. Please try again." }, 500);
}

   const allowedOrigins = new Set([
  "https://rockcraft.netlify.app",
]);

const origin = req.headers.get("origin");
const callbackUrl = origin && allowedOrigins.has(origin)
  ? `${origin}/dashboard?payment=verify`
  : "https://rockcraft.netlify.app/dashboard?payment=verify";
  let paystackRes: Response;

try {
  paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: userEmail,
      amount: PRO_PRICE_KOBO,
      currency: "NGN",
      reference,
      callback_url: callbackUrl,
      metadata: {
        user_id: userId,
        payment_id: payment.id,
        plan_id: "lifetime_access",
      },
    }),
    signal: AbortSignal.timeout(20000),
  });
} catch (error) {
  console.error("Paystack initialization outcome is uncertain:", error);

  return json({
    error: "We could not confirm whether Paystack started this payment. Check your payment history before retrying.",
    reference,
    pending_reconciliation: true,
  }, 202);
}

let paystackData: {
  status?: boolean;
  message?: string;
  data?: {
    authorization_url?: string;
  };
};

try {
  paystackData = await paystackRes.json();
} catch (error) {
  console.error("Paystack returned an unreadable initialization response:", error);

  return json({
    error: "We could not confirm the payment status. Check your payment history before retrying.",
    reference,
    pending_reconciliation: true,
  }, 202);
}

if (paystackRes.status >= 500 ||
    (paystackRes.ok && (paystackData?.status !== true || !paystackData?.data?.authorization_url))) {
  console.error("Paystack initialization outcome is uncertain:", paystackRes.status);

  return json({
    error: "We could not confirm whether Paystack started this payment. Check your payment history before retrying.",
    reference,
    pending_reconciliation: true,
  }, 202);
}

if (!paystackRes.ok || paystackData?.status !== true || !paystackData?.data?.authorization_url) {
  const { error: updateError } = await serviceClient
    .from("payments")
    .update({ status: "failed" })
    .eq("id", payment.id);

  if (updateError) {
    console.error("Could not record rejected payment initialization:", updateError.message);

    return json({
      error: "Paystack rejected the initialization, but the payment record could not be updated. Contact support before retrying.",
      reference,
    }, 202);
  }

  console.error("Paystack initialization rejected:", paystackData?.message || paystackRes.status);

  return json({
    error: paystackData?.message || "Paystack could not start your payment. Please try again.",
    reference,
  }, 502);
}


const authorizationUrl = paystackData.data.authorization_url;

const { error: saveUrlError } = await serviceClient
  .from("payments")
  .update({ paystack_authorization_url: authorizationUrl })
  .eq("id", payment.id);

if (saveUrlError) {
  console.error("Could not save Paystack checkout URL:", saveUrlError.message);

  return json({
    error: "Paystack may have started your payment, but we could not save its checkout details. Please contact support before retrying.",
    reference,
    pending_reconciliation: true,
  }, 202);
}

return json({
  status: true,
  data: {
    authorization_url: authorizationUrl,
    reference,
  },
});

  } catch (error: unknown) {
    console.error("Payment initialization error:", error);
    return json({ error: "We could not start the payment. Please try again." }, 500);
  }
});
