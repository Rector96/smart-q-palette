import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  let reservationId = "";
  let serviceClient: SupabaseClient | null = null;
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

    const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    serviceClient = adminClient;
    const { data: bank, error: bankError } = await adminClient.from("referral_bank_accounts")
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

    reservedReference = `sqprwd-${crypto.randomUUID().replaceAll("-", "").toLowerCase()}`;
    const { data: reservation, error: reserveError } = await adminClient.rpc("reserve_referral_withdrawal", {
      p_user_id: userId,
      p_bank_account_id: bankAccountId,
      p_amount: amount,
      p_reference: reservedReference,
    });

    let withdrawalId = reservation?.withdrawal_id;
    if (reserveError || !withdrawalId) {
      const { data: existingReservation, error: lookupError } = await adminClient
        .from("referral_withdrawals")
        .select("id,user_id,bank_account_id,amount,reference")
        .eq("reference", reservedReference)
        .eq("user_id", userId)
        .maybeSingle();

      if (lookupError) {
        console.error("Could not resolve withdrawal reservation:", lookupError.message);
        return json({
          error: "We could not confirm whether your balance was reserved. Refresh your withdrawal history before trying again.",
        }, 503);
      }

      if (
        !existingReservation ||
        existingReservation.bank_account_id !== bankAccountId ||
        Number(existingReservation.amount) !== amount
      ) {
        return json({ error: reserveError?.message || "We could not reserve this withdrawal." }, 409);
      }

      withdrawalId = existingReservation.id;
    }
    reservationId = withdrawalId;

    const { data: withdrawal, error: withdrawalLookupError } = await adminClient
      .from("referral_withdrawals")
      .select("id,amount,currency,reference,status")
      .eq("id", reservationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (withdrawalLookupError || !withdrawal) {
      console.error("Could not verify reserved withdrawal:", withdrawalLookupError?.message);
      return json({
        accepted: true,
        status: "queued",
        reference: reservedReference,
        warning: "Your balance is reserved, but the withdrawal record could not be verified. Do not submit another withdrawal; support will check it.",
      });
    }

    const expectedAmountKobo = Math.round(Number(withdrawal.amount) * 100);
    if (
      withdrawal.reference !== reservedReference ||
      withdrawal.currency !== "NGN" ||
      Number(withdrawal.amount) !== amount ||
      !Number.isSafeInteger(expectedAmountKobo) ||
      expectedAmountKobo !== amount * 100
    ) {
      console.error("Reserved withdrawal details did not match the request:", reservedReference);
      return json({
        accepted: true,
        status: withdrawal.status,
        reference: reservedReference,
        warning: "The reserved withdrawal details do not match the request. Your balance remains reserved while support reviews it.",
      });
    }

    const responseDetails = {
      reference: reservedReference,
      amount,
      test_mode: isTestSecret,
      bank: {
        bank_name: bank.bank_name,
        account_name: bank.account_name,
        account_number_masked: bank.account_number_masked,
      },
    };

    const respondWithCurrentStatus = async (warning: string, fallbackStatus = "queued") => {
      const { data: currentWithdrawal, error: currentStatusError } = await adminClient
        .from("referral_withdrawals")
        .select("status")
        .eq("id", reservationId)
        .maybeSingle();
      if (currentStatusError) {
        console.error("Could not refresh withdrawal status:", currentStatusError.message);
      }
      return json({
        accepted: true,
        ...responseDetails,
        status: currentWithdrawal?.status || fallbackStatus,
        warning,
      });
    };

    let transferResponse: Response | null = null;
    let transferPayload: Record<string, unknown> | null = null;
    try {
      transferResponse = await fetch("https://api.paystack.co/transfer", {
        method: "POST",
        headers: { Authorization: `Bearer ${paystackSecret}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "balance",
          amount: expectedAmountKobo,
          recipient: recipientCode,
          reason: "ROCKCBT referral reward withdrawal",
          reference: reservedReference,
        }),
      });
      transferPayload = await transferResponse.json().catch(() => null);
      if (!transferResponse.ok || transferPayload?.status !== true) {
        console.warn(
          "Paystack transfer initiation response requires verification:",
          reservedReference,
          transferResponse.status,
        );
      }
    } catch (error) {
      console.error("Paystack transfer initiation response was inconclusive:", reservedReference, error);
    }

    let verifyResponse: Response;
    try {
      verifyResponse = await fetch(
        `https://api.paystack.co/transfer/verify/${encodeURIComponent(reservedReference)}`,
        { headers: { Authorization: `Bearer ${paystackSecret}` } },
      );
    } catch (error) {
      console.error("Could not verify transfer after initiation:", reservedReference, error);
      return await respondWithCurrentStatus(
        "Paystack's transfer outcome is inconclusive. Your balance remains reserved; do not submit another withdrawal.",
      );
    }

    const verifyPayload = await verifyResponse.json().catch(() => null);
    if (!verifyResponse.ok || verifyPayload?.status !== true || !verifyPayload?.data) {
      console.warn("Paystack transfer verification is inconclusive:", reservedReference, verifyResponse.status);
      return await respondWithCurrentStatus(
        "Paystack could not confirm the transfer outcome. Your balance remains reserved while it is checked; do not submit another withdrawal.",
      );
    }

    const verifiedTransfer = verifyPayload.data;
    const verifiedStatus = String(verifiedTransfer.status || "").toLowerCase();
    if (
      verifiedTransfer.reference !== withdrawal.reference ||
      Number(verifiedTransfer.amount) !== expectedAmountKobo ||
      verifiedTransfer.currency !== withdrawal.currency
    ) {
      console.error("Paystack transfer details did not match the reserved withdrawal:", reservedReference);
      return await respondWithCurrentStatus(
        "Paystack's transfer details do not match the reserved withdrawal. Your balance remains reserved while support reviews it.",
      );
    }

    if (["success", "failed", "reversed"].includes(verifiedStatus)) {
      const failureReason = verifiedStatus === "success"
        ? null
        : typeof verifiedTransfer.failures === "string"
          ? verifiedTransfer.failures
          : typeof verifyPayload.message === "string"
            ? verifyPayload.message
            : `Paystack confirmed transfer ${verifiedStatus}.`;
      const { data: settlement, error: settlementError } = await serviceClient.rpc(
        "settle_referral_withdrawal",
        {
          p_reference: reservedReference,
          p_outcome: verifiedStatus,
          p_transfer_code: typeof verifiedTransfer.transfer_code === "string"
            ? verifiedTransfer.transfer_code
            : null,
          p_failure_reason: failureReason,
        },
      );

      const { data: currentWithdrawal, error: currentStatusError } = await serviceClient
        .from("referral_withdrawals")
        .select("status")
        .eq("id", reservationId)
        .maybeSingle();
      if (currentStatusError) {
        console.error("Could not confirm settled withdrawal status:", currentStatusError.message);
      }

      const alreadySettledAsVerified = settlement?.reason === "already_processed" &&
        currentWithdrawal?.status === verifiedStatus;
      if (settlementError || (settlement?.updated !== true && !alreadySettledAsVerified)) {
        console.error(
          "Verified transfer settlement needs reconciliation:",
          settlementError?.message || settlement,
          currentWithdrawal?.status,
        );
        return json({
          accepted: true,
          ...responseDetails,
          status: currentWithdrawal?.status || "queued",
          warning: "Paystack confirmed a final transfer result, but the wallet status needs reconciliation. Do not submit another withdrawal; contact support.",
        });
      }

      const finalStatus = currentWithdrawal?.status || verifiedStatus;
      const statusChangedDuringSettlement = finalStatus !== verifiedStatus;
      return json({
        accepted: true,
        ...responseDetails,
        status: finalStatus,
        message: statusChangedDuringSettlement
          ? `The transfer status changed while it was being reconciled. The current status is ${finalStatus}.`
          : finalStatus === "success"
            ? "Paystack confirmed your transfer was successful."
            : finalStatus === "failed"
              ? "Paystack confirmed the transfer failed. The reserved balance has been returned."
              : "Paystack confirmed the transfer was reversed. The reserved balance has been returned.",
        ...(statusChangedDuringSettlement
          ? { warning: "Do not submit another withdrawal; support will review the status change." }
          : {}),
      });
    }

    if (verifiedStatus === "otp") {
      const { error: otpStatusError } = await serviceClient
        .from("referral_withdrawals")
        .update({
          status: "otp",
          paystack_transfer_code: typeof verifiedTransfer.transfer_code === "string"
            ? verifiedTransfer.transfer_code
            : null,
        })
        .eq("id", reservationId)
        .in("status", ["queued", "processing"]);
      if (otpStatusError) {
        console.error("Could not record Paystack OTP status:", otpStatusError.message);
      }
      return await respondWithCurrentStatus(
        "Paystack is requesting business OTP approval. You do not need to enter a code. Your balance remains reserved while support checks the transfer settings.",
        "otp",
      );
    }

    if (["queued", "pending", "processing"].includes(verifiedStatus)) {
      const nextStatus = verifiedStatus === "queued" ? "queued" : "processing";
      const { error: updateError } = await serviceClient
        .from("referral_withdrawals")
        .update({
          status: nextStatus,
          paystack_transfer_code: typeof verifiedTransfer.transfer_code === "string"
            ? verifiedTransfer.transfer_code
            : null,
        })
        .eq("id", reservationId)
        .in("status", ["queued", "otp", "processing"]);

      if (updateError) {
        console.error("Could not update pending withdrawal status:", updateError.message);
      }
      return await respondWithCurrentStatus(
        updateError
          ? "Paystack is processing the transfer, but the latest status could not be saved. Do not submit another withdrawal."
          : isTestSecret
            ? "Your test withdrawal is being processed. No real money will be sent."
            : "Your withdrawal is being processed by Paystack. Do not submit another withdrawal while it is pending.",
        nextStatus,
      );
    }

    console.warn("Paystack returned an unrecognized transfer status:", reservedReference, verifiedStatus);
    return await respondWithCurrentStatus(
      "Paystack returned an unrecognized transfer status. Your balance remains reserved while support checks it.",
    );
  } catch (error) {
    console.error("Referral withdrawal failed:", error);
    if (reservationId && serviceClient) {
      const { data: currentWithdrawal, error: currentStatusError } = await serviceClient
        .from("referral_withdrawals")
        .select("status")
        .eq("id", reservationId)
        .maybeSingle();
      if (currentStatusError) {
        console.error("Could not refresh withdrawal after an error:", currentStatusError.message);
      }
      return json({
        accepted: true,
        status: currentWithdrawal?.status || "queued",
        reference: reservedReference,
        warning: "The transfer outcome is uncertain. Your balance remains reserved while support checks its status. Do not submit another withdrawal.",
      });
    }
    return json({ error: error instanceof Error ? error.message : "Withdrawal could not be processed." }, 500);
  }
});
