
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});


type SettlementResult = {
  updated?: boolean;
  reason?: string;
  status?: string;
};

type SettlementRpcClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

const settleConfirmedOutcome = async (
  client: unknown,
  reference: string,
  outcome: "success" | "failed" | "reversed",
  transferCode: string | null,
  reason: string,
): Promise<boolean> => {
  const rpcClient = client as SettlementRpcClient;

  const { data, error } = await rpcClient.rpc(
    "settle_referral_withdrawal",
    {
      p_reference: reference,
      p_outcome: outcome,
      p_transfer_code: transferCode,
      p_failure_reason: reason,
    },
  );

  if (error) {
    console.error(
      "Referral withdrawal settlement failed:",
      reference,
      error.message,
    );
    return false;
  }

  const result = data as SettlementResult | null;

  return result?.updated === true ||
    result?.reason === "already_processed";
};


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let reservedReference = "";

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

    if (!token || token === authorization) {
      return json({ error: "Please sign in first." }, 401);
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
    });

    const { data: authData, error: authError } = await authClient.auth.getUser(token);

    if (authError || !authData.user) {
      return json({ error: "Your session has expired. Please sign in again." }, 401);
    }

    const userId = authData.user.id;
    const body = await req.json().catch(() => ({}));
    const amount = Number(body?.amount);
    const bankAccountId = typeof body?.bank_account_id === "string"
      ? body.bank_account_id
      : "";

    if (
    !Number.isSafeInteger(amount) ||
    amount < 1000 ||
    !Number.isSafeInteger(amount * 100) ||
    !bankAccountId
  ) {
      return json({ error: "Enter a whole-naira withdrawal amount of at least NGN 1,000." }, 400);
    }

    const serviceClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: bank, error: bankError } = await serviceClient
      .from("referral_bank_accounts")
      .select("id,paystack_recipient_code,account_name,bank_name,account_number_masked")
      .eq("id", bankAccountId)
      .eq("user_id", userId)
      .eq("is_verified", true)
      .maybeSingle();

    if (bankError || !bank) {
      return json({ error: "Choose one of your verified bank accounts." }, 400);
    }

    const storedRecipientCode = String(bank.paystack_recipient_code || "");
    const isTestRecipient = storedRecipientCode.startsWith("TEST:");
    const isTestSecret = paystackSecret.startsWith("sk_test_");

    if (isTestRecipient && !isTestSecret) {
      return json({
        accepted: false,
        test_account: true,
        error: "This test recipient can only be used with Paystack test keys.",
      }, 400);
    }

    const recipientCode = isTestRecipient
      ? storedRecipientCode.slice(5)
      : storedRecipientCode;

    if (!recipientCode.startsWith("RCP_")) {
      return json({
        error: "The saved bank recipient is invalid. Please add and verify the bank account again.",
      }, 400);
    }

   reservedReference = `sqprwd-${crypto.randomUUID().replaceAll("-", "").toLowerCase()}`;

    const { data: reservation, error: reserveError } = await serviceClient.rpc(
      "reserve_referral_withdrawal",
      {
        p_user_id: userId,
        p_bank_account_id: bankAccountId,
        p_amount: amount,
        p_reference: reservedReference,
      },
    );


let reservationId: string | null =
  typeof reservation?.withdrawal_id === "string"
    ? reservation.withdrawal_id
    : null;

if (reserveError || !reservationId) {
  const { data: existingReservation, error: lookupError } =
    await serviceClient
      .from("referral_withdrawals")
      .select("id,user_id,bank_account_id,amount,reference")
      .eq("reference", reservedReference)
      .eq("user_id", userId)
      .maybeSingle();

  if (lookupError) {
    console.error(
      "Could not resolve withdrawal reservation:",
      lookupError.message,
    );
    return json({
      error: "We could not confirm whether your balance was reserved. Refresh your withdrawal history before trying again.",
    }, 503);
  }

  if (
    !existingReservation ||
    existingReservation.bank_account_id !== bankAccountId ||
    Number(existingReservation.amount) !== amount
  ) {
    return json({
      error: reserveError?.message || "We could not reserve this withdrawal.",
    }, 409);
  }

  reservationId = existingReservation.id;
}

if (!reservationId) {
  return json({
    error: "The withdrawal reservation could not be confirmed.",
  }, 409);
}

const confirmedReservationId = reservationId;


const { data: withdrawal, error: withdrawalLookupError } =
  await serviceClient
    .from("referral_withdrawals")
    .select("id,amount,currency,reference,status")
    .eq("id", confirmedReservationId)
    .eq("user_id", userId)
    .maybeSingle();

if (withdrawalLookupError || !withdrawal) {
  console.error(
    "Could not verify reserved withdrawal:",
    withdrawalLookupError?.message,
  );

  return json({
    accepted: true,
    status: "queued",
    reference: reservedReference,
    warning: "Your balance may be reserved, but the withdrawal record could not be verified. Do not submit another withdrawal.",
  }, 202);
}

const expectedAmountKobo = Math.round(Number(withdrawal.amount) * 100);

  if (
    withdrawal.reference !== reservedReference ||
    withdrawal.currency !== "NGN" ||
    Number(withdrawal.amount) !== amount ||
    !Number.isSafeInteger(expectedAmountKobo) ||
    expectedAmountKobo !== amount * 100 ||
    withdrawal.status !== "queued"
  ) {
    console.error("Reserved withdrawal validation failed:", reservedReference);

    return json({
      accepted: true,
      status: withdrawal.status,
      reference: reservedReference,
      warning: "The reserved withdrawal details could not be validated. Your balance remains reserved for review.",
    }, 202);
  }

    // Once funds are reserved, an uncertain Paystack response must never
    // automatically release them. The reference is retained for reconciliation.
    let transferResponse: Response;

    try {
      transferResponse = await fetch("https://api.paystack.co/transfer", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: "balance",
          amount: amount * 100,
          recipient: recipientCode,
          reason: "ROCKCBT referral reward withdrawal",
          reference: reservedReference,
        }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      console.error("Paystack transfer response is uncertain:", reservedReference, error);

      return json({
        accepted: false,
        pending_reconciliation: true,
        status: "queued",
        reference: reservedReference,
        message: "Your withdrawal request was reserved, but Paystack's response could not be confirmed. Your balance remains protected. Please contact support and do not submit another request.",
      }, 202);
    }

const transferPayload = await transferResponse.json().catch(() => ({}));

if (!transferResponse.ok || transferPayload?.status !== true) {
  console.warn("Transfer initiation response requires verification:", {
    reference: reservedReference,
    httpStatus: transferResponse.status,
  });
}

let verifyResponse: Response;

try {
  verifyResponse = await fetch(
    `https://api.paystack.co/transfer/verify/${encodeURIComponent(reservedReference)}`,
    {
      headers: { Authorization: `Bearer ${paystackSecret}` },
    },
  );
} catch (error) {
  console.error("Could not verify transfer:", reservedReference, error);
  return json({
    accepted: false,
    pending_reconciliation: true,
    status: "queued",
    reference: reservedReference,
    message: "The transfer outcome is uncertain. Your balance remains reserved. Do not submit another withdrawal.",
  }, 202);
}

  const verifyPayload = await verifyResponse.json().catch(() => null);

  if (!verifyResponse.ok || verifyPayload?.status !== true || !verifyPayload?.data) {
    return json({
      accepted: false,
      pending_reconciliation: true,
      status: "queued",
      reference: reservedReference,
      message: "Paystack could not confirm the transfer. Your balance remains reserved while it is checked.",
    }, 202);
  }

  const transfer = verifyPayload.data;
  const paystackStatus = String(transfer.status || "").toLowerCase();
  const transferCode = typeof transfer.transfer_code === "string"
    ? transfer.transfer_code
    : null;

  if (
    transfer.reference !== reservedReference ||
    Number(transfer.amount) !== amount * 100 ||
    transfer.currency !== "NGN"
  ) {
    return json({
      accepted: false,
      pending_reconciliation: true,
      status: "queued",
      reference: reservedReference,
      message: "Paystack's transfer details did not match the reserved withdrawal. Your balance remains reserved.",
    }, 202);
  }

  // Release funds only when Paystack explicitly reports a terminal outcome
  // and the database confirms that settlement was recorded.
  if (paystackStatus === "failed" || paystackStatus === "reversed") {
    const settled = await settleConfirmedOutcome(
      serviceClient,
      reservedReference,
      paystackStatus,
      transferCode,
      String(transfer.reason || "Paystack reported a failed transfer."),
    );

    if (!settled) {
      return json({
        accepted: false,
        pending_reconciliation: true,
        status: "queued",
        reference: reservedReference,
        message: "Paystack reported a terminal transfer outcome, but wallet settlement needs reconciliation. Your balance remains reserved.",
      }, 202);
    }

    return json({
      accepted: false,
      status: paystackStatus,
      reference: reservedReference,
      message: "Paystack confirmed that the transfer did not complete. Wallet settlement was recorded.",
    }, 409);
  }

  if (paystackStatus === "success") {
    const settled = await settleConfirmedOutcome(
      serviceClient,
      reservedReference,
      "success",
      transferCode,
      "Paystack confirmed successful transfer.",
    );

    if (!settled) {
      return json({
        accepted: true,
        pending_reconciliation: true,
        status: "queued",
        reference: reservedReference,
        message: "Paystack confirmed the transfer, but wallet settlement needs reconciliation.",
      }, 202);
    }

    return json({
      accepted: true,
      status: "success",
      reference: reservedReference,
      amount,
      message: "Paystack confirmed your withdrawal successfully.",
    });
  }

    // OTP is an active transfer state, not a failed transfer.
    // Keep the reserved funds unavailable until Paystack confirms an outcome.
   if (!["otp", "queued", "pending", "processing"].includes(paystackStatus)) {
    console.error("Unrecognized Paystack transfer status:", {
      reference: reservedReference,
      status: paystackStatus,
    });

    return json({
      accepted: false,
      pending_reconciliation: true,
      status: "queued",
      reference: reservedReference,
      message: "Paystack returned an unrecognized transfer status. Your funds remain reserved for review.",
    }, 202);
  }

const nextStatus = paystackStatus === "otp" ? "otp" : "processing";

    const { data: savedWithdrawal, error: updateError } = await serviceClient
      .from("referral_withdrawals")
      .update({
        status: nextStatus,
        paystack_transfer_code: transferCode,
      })
      .eq("id",confirmedReservationId)
      .eq("status", "queued")
      .select("id,status")
      .maybeSingle();

    if (updateError || !savedWithdrawal) {
      console.error("Could not persist Paystack transfer status:", {
        reference: reservedReference,
        error: updateError?.message,
      });

      // A webhook may already have updated the row. Read the current status
      // rather than overwriting a terminal outcome.
      const { data: currentWithdrawal, error: currentError } = await serviceClient
        .from("referral_withdrawals")
        .select("status")
        .eq("id", confirmedReservationId)
        .maybeSingle();

      if (currentError || !currentWithdrawal) {
        return json({
          accepted: true,
          pending_reconciliation: true,
          reference: reservedReference,
          warning: "Paystack accepted the transfer, but its database status needs reconciliation. Do not submit another withdrawal.",
        }, 202);
      }

      return json({
        accepted: true,
        status: currentWithdrawal.status,
        reference: reservedReference,
        pending_reconciliation: true,
        warning: "The transfer status was updated separately. Please refresh your withdrawal history.",
      }, 202);
    }

    return json({
      accepted: true,
      status: savedWithdrawal.status,
      test_mode: isTestSecret,
      reference: reservedReference,
      amount,
      bank: {
        bank_name: bank.bank_name,
        account_name: bank.account_name,
        account_number_masked: bank.account_number_masked,
      },
      message: nextStatus === "otp"
        ? "Paystack requires transfer authorisation. Your funds remain reserved until the transfer outcome is confirmed."
        : isTestSecret
        ? "Your test withdrawal was accepted. This is a simulation; no real money will be sent."
        : "Your withdrawal request has been sent to Paystack. We will update its status when the transfer is confirmed.",
    });
  } catch (error) {
    console.error("Referral withdrawal failed:", error);

    return json({
      error: "Withdrawal processing encountered an unexpected error. If your balance was reserved, contact support before retrying.",
      reference: reservedReference || undefined,
      pending_reconciliation: Boolean(reservedReference),
    }, 500);
  }
});