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
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

interface PaystackBank {
  name: string;
  code: string;
  slug?: string;
}

const isPaystackBank = (value: unknown): value is PaystackBank =>
  isRecord(value) && typeof value.name === "string" && typeof value.code === "string" &&
  (value.slug === undefined || typeof value.slug === "string");

const paystack = async (path: string, secret: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!isRecord(payload)) throw new Error("Paystack returned an invalid response.");
  if (!response.ok || payload.status !== true) {
    throw new Error(typeof payload.message === "string" ? payload.message : "Paystack could not complete the bank request.");
  }
  return payload.data;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let requestedAction = "";
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey || !paystackSecret) {
      return json({ error: "Bank verification is not configured yet." }, 503);
    }

    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token || token === authorization) return json({ error: "Please sign in first." }, 401);

    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Your session has expired. Please sign in again." }, 401);
    const userId = authData.user.id;

    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    requestedAction = typeof action === "string" ? action : "";

    if (action === "list_banks") {
      const bankResponse = await paystack("/bank?country=nigeria&use_cursor=false&perPage=100", paystackSecret);
      if (!Array.isArray(bankResponse)) throw new Error("Paystack returned an invalid bank list.");
      const banks = bankResponse.filter(isPaystackBank);
      const testModeEnabled = paystackSecret.startsWith("sk_test_") &&
        Deno.env.get("REFERRAL_TEST_BANK_VERIFICATION") === "true";
      return json({
        banks: banks.map(({ name, code, slug }) => ({ name, code, slug })),
        test_mode_enabled: testModeEnabled,
      });
    }

    // This creates a clearly marked Paystack test recipient only. It never
    // performs a real account resolve and its TEST: marker prevents payouts.
    if (action === "save_test_account") {
      if (!paystackSecret.startsWith("sk_test_") ||
          Deno.env.get("REFERRAL_TEST_BANK_VERIFICATION") !== "true") {
        return json({ error: "Test bank setup is disabled." }, 403);
      }
      const serviceClient = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: profile, error: profileError } = await serviceClient
        .from("referral_profiles").select("signup_full_name")
        .eq("user_id", userId).maybeSingle();
     const registeredName = String(profile?.signup_full_name || "").trim();

      if (profileError || !registeredName) {
        return json({
          error: "Your registered signup name is missing. Please contact support.",
        }, 400);
      }
      const recipient = await paystack("/transferrecipient", paystackSecret, {
        method: "POST",
        body: JSON.stringify({
          type: "nuban",
          name: registeredName,
          account_number: "1000000001",
          bank_code: "057",
          currency: "NGN",
        }),
      });
      const recipientCode = isRecord(recipient) && typeof recipient.recipient_code === "string"
        ? recipient.recipient_code
        : "";
      if (!recipientCode) {
        return json({ error: "Paystack did not create its test recipient." }, 502);
      }
      const { data: saved, error: saveError } = await serviceClient
        .from("referral_bank_accounts").insert({
          user_id: userId,
          bank_code: "057",
          bank_name: "Zenith Bank (Paystack test)",
          account_name: registeredName,
          account_number_masked: "TEST ••••0001",
          paystack_recipient_code: `TEST:${recipientCode}`,
          is_verified: true,
        }).select("id,bank_name,account_name,account_number_masked").single();
      if (saveError) {
        console.error("Could not save test recipient:", saveError.message);
        return json({ error: "The test recipient was created but could not be saved." }, 500);
      }
      return json({ saved: true, test_mode: true, bank_account: saved });
    }

    const accountNumber = typeof body?.account_number === "string" ? body.account_number.trim() : "";
    const bankCode = typeof body?.bank_code === "string" ? body.bank_code.trim() : "";
    if (!/^\d{10}$/.test(accountNumber) || !/^\d{2,10}$/.test(bankCode)) {
      return json({ verified: false, error: "Enter a valid 10-digit account number and select a bank." }, action === "resolve_account" ? 200 : 400);
    }

    const resolved = await paystack(
      `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
      paystackSecret,
    );
    const accountName = isRecord(resolved) && typeof resolved.account_name === "string"
      ? resolved.account_name.trim()
      : "";
    if (!accountName) return json({ verified: false, error: "Paystack could not verify this bank account." }, action === "resolve_account" ? 200 : 422);

    // Compare against the name recorded at signup. This check is performed on
    // the server for both verification and saving; a browser cannot bypass it.
    const serviceClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: referralProfile, error: profileError } = await serviceClient
      .from("referral_profiles")
      .select("signup_full_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileError) {
      console.error("Could not load the protected signup name:", profileError.message);
      return json({ verified: false, error: "We could not confirm your registered name. Please try again." }, action === "resolve_account" ? 200 : 500);
    }
    const registeredName = String(referralProfile?.signup_full_name || "").trim();
    const normalizeName = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!registeredName) {
      return json({ verified: false, error: "Your ROCKCBT account has no saved signup name. Please contact support before adding a withdrawal account." }, action === "resolve_account" ? 200 : 400);
    }
    if (normalizeName(accountName) !== normalizeName(registeredName)) {
      return json({
        error: `The bank account name ( ${accountName} ) does not match your ROCKCBT signup name ( ${registeredName} ). For security, use a bank account registered in your name.`,
      }, action === "resolve_account" ? 200 : 422);
    }

    if (action === "resolve_account") {
      return json({ verified: true, account_name: accountName });
    }

    if (action !== "save_account") return json({ error: "Unsupported bank action." }, 400);

    // Re-resolve server-side before creating a Paystack recipient. The account number
    // is never written to the database; only the Paystack recipient code and masked
    // account number are retained.
    const recipient = await paystack("/transferrecipient", paystackSecret, {
      method: "POST",
      body: JSON.stringify({
        type: "nuban",
        name: accountName,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: "NGN",
      }),
    });
    const recipientCode = isRecord(recipient) && typeof recipient.recipient_code === "string"
      ? recipient.recipient_code
      : "";
    if (!recipientCode) return json({ error: "Paystack did not create the bank recipient." }, 502);

    const bankName = typeof body?.bank_name === "string" ? body.bank_name.trim().slice(0, 100) : "Nigerian bank";
    const { data: saved, error: saveError } = await serviceClient.from("referral_bank_accounts").insert({
      user_id: userId,
      bank_code: bankCode,
      bank_name: bankName,
      account_name: accountName,
      account_number_masked: `******${accountNumber.slice(-4)}`,
      paystack_recipient_code: recipientCode,
      is_verified: true,
    }).select("id,bank_name,account_name,account_number_masked").single();

    if (saveError) {
      console.error("Could not save verified bank recipient:", saveError.message);
      return json({ error: "The account was verified but could not be saved. Please try again." }, 500);
    }
    return json({ saved: true, bank_account: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bank verification failed.";
    // For account resolution, return expected Paystack failures as a normal
    // JSON response. Supabase JS otherwise wraps non-2xx responses in an
    // FunctionsHttpError, which can hide the useful response body in the UI.
    if (requestedAction === "resolve_account") {
      console.warn("Referral bank account resolution was rejected:", message);
      return json({ verified: false, error: message });
    }
    console.error("Referral bank operation failed:", message);
    return json({ error: message }, 502);
  }
});
