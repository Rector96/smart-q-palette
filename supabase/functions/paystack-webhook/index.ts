
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isRefundEventRecorded,
  isTransferSettlementRecorded,
} from "../_shared/financial-reconciliation.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const constantTimeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }

  return diff === 0;
};

const hmacHex = async (secret: string, message: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const verifySignature = async (rawBody: string, req: Request) => {
  const modernHeader = req.headers.get("paystack-signature");

  if (modernHeader) {
    const webhookSecret = Deno.env.get("PAYSTACK_WEBHOOK_SECRET");
    if (!webhookSecret) return false;

    const fields = modernHeader.split(",").map((part) =>
      part.trim().split("=", 2)
    );

    const timestampValue = fields.find(([key]) => key === "t")?.[1];
    const timestamp = Number(timestampValue);

    if (
      !Number.isFinite(timestamp) ||
      Math.abs(Date.now() / 1000 - timestamp) > 300
    ) {
      return false;
    }

    const signatures = fields
      .filter(([key]) => key === "v1")
      .map(([, value]) => value || "");

    const expected = await hmacHex(
      webhookSecret,
      `${timestamp}.${rawBody}`,
    );

    return signatures.some((entry) => {
      const separator = entry.indexOf(":");
      const hex = separator >= 0 ? entry.slice(separator + 1) : entry;

      return /^[0-9a-f]{128}$/.test(hex) &&
        constantTimeEqual(expected, hex);
    });
  }

  const legacyHeader = req.headers.get("x-paystack-signature");
  const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");

  if (
    !legacyHeader ||
    !paystackSecret ||
    !/^[0-9a-f]{128}$/.test(legacyHeader)
  ) {
    return false;
  }

  const expected = await hmacHex(paystackSecret, rawBody);
  return constantTimeEqual(expected, legacyHeader);
};

serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const rawBody = await req.text();

    if (!(await verifySignature(rawBody, req))) {
      return json({ error: "Invalid or missing Paystack signature." }, 401);
    }

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

      const transferReference =
        typeof transfer.reference === "string"
          ? transfer.reference
          : "";

      if (!transferReference) {
        return json({ error: "Transfer reference is missing." }, 400);
      }

      const transferSupabaseUrl = Deno.env.get("SUPABASE_URL");
      const transferServiceKey = Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY",
      );

      if (!transferSupabaseUrl || !transferServiceKey) {
        return json({ error: "Webhook is temporarily unavailable." }, 503);
      }

      const transferServiceClient = createClient(
        transferSupabaseUrl,
        transferServiceKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        },
      );

      // Find the withdrawal using the signed Paystack event reference.
      const { data: withdrawal, error: withdrawalError } =
        await transferServiceClient
          .from("referral_withdrawals")
          .select("id, user_id, bank_account_id, amount, currency, reference")
          .eq("reference", transferReference)
          .maybeSingle();

      if (withdrawalError) {
        console.error(
          "Transfer withdrawal lookup failed:",
          withdrawalError.message,
        );
        return json({ error: "Withdrawal verification failed." }, 500);
      }

      if (!withdrawal) {
        console.error(
          "Transfer event has no matching withdrawal:",
          transferReference,
        );
        return json({ error: "Unknown withdrawal reference." }, 404);
      }

      // Verify the amount and currency against the saved withdrawal.
      const expectedAmount = Math.round(Number(withdrawal.amount) * 100);
      const eventAmount = Number(transfer.amount);

      if (
        !Number.isSafeInteger(expectedAmount) ||
        expectedAmount <= 0 ||
        !Number.isSafeInteger(eventAmount) ||
        eventAmount !== expectedAmount ||
        withdrawal.currency !== "NGN" ||
        transfer.currency !== "NGN"
      ) {
        console.error(
          "Transfer amount or currency mismatch:",
          transferReference,
        );
        return json({
          error: "Transfer details did not match the withdrawal.",
        }, 400);
      }

      // Confirm that the event recipient belongs to the saved bank account.
      const { data: bankAccount, error: bankError } =
        await transferServiceClient
          .from("referral_bank_accounts")
          .select("paystack_recipient_code")
          .eq("id", withdrawal.bank_account_id)
          .eq("user_id", withdrawal.user_id)
          .eq("is_verified", true)
          .maybeSingle();

      if (bankError) {
        console.error(
          "Transfer bank account lookup failed:",
          bankError.message,
        );
        return json({ error: "Bank account verification failed." }, 500);
      }

      if (!bankAccount?.paystack_recipient_code) {
        console.error(
          "Verified withdrawal bank account not found:",
          transferReference,
        );
        return json({
          error: "Withdrawal bank account could not be verified.",
        }, 400);
      }

      const eventRecipient = transfer.recipient;

      const eventRecipientCode =
        typeof eventRecipient === "string"
          ? eventRecipient
          : typeof eventRecipient?.recipient_code === "string"
          ? eventRecipient.recipient_code
          : "";

      const storedRecipientCode =
        bankAccount.paystack_recipient_code.replace(/^TEST:/, "");

      if (
        !eventRecipientCode ||
        eventRecipientCode !== storedRecipientCode
      ) {
        console.error(
          "Transfer recipient mismatch:",
          transferReference,
        );
        return json({
          error: "Transfer recipient did not match the saved bank account.",
        }, 400);
      }

      const { data: settlement, error: settlementError } =
        await transferServiceClient.rpc(
          "settle_referral_withdrawal",
          {
            p_reference: transferReference,
            p_outcome: transferOutcome,
            p_transfer_code:
              typeof transfer.transfer_code === "string"
                ? transfer.transfer_code
                : null,
            p_failure_reason:
              typeof transfer.reason === "string"
                ? transfer.reason
                : null,
          },
        );

      if (settlementError) {
        console.error(
          "Referral transfer settlement failed:",
          settlementError.message,
        );
        return json({
          error: "Transfer outcome could not be recorded.",
        }, 500);
      }

      const settlementRecorded = isTransferSettlementRecorded(
        settlement,
        transferOutcome,
      );

      if (!settlementRecorded) {
        console.error(
          "Referral transfer outcome was not recorded:",
          {
            reference: transferReference,
            outcome: transferOutcome,
            reason: settlement?.reason || "unrecognized_result",
          },
        );

        return json({
          error: "Transfer outcome could not be reconciled.",
        }, 500);
      }

      console.info(
        "Referral transfer webhook processed:",
        transferReference,
        settlement,
      );

      return json({ received: true });
    }

    // Reconcile refunds against Paystack's authoritative processed-refund list.
    if (event?.event === "refund.processed") {
      const refund = event?.data || {};
      const paymentReference =
        typeof refund.transaction_reference === "string"
          ? refund.transaction_reference.trim()
          : typeof refund.transaction?.reference === "string"
          ? refund.transaction.reference.trim()
          : "";

      if (!paymentReference || paymentReference.length > 100) {
        return json({ error: "Refund transaction reference is missing or invalid." }, 400);
      }

      const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
      const refundSupabaseUrl = Deno.env.get("SUPABASE_URL");
      const refundServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!paystackSecret || !refundSupabaseUrl || !refundServiceKey) {
        return json({ error: "Webhook is temporarily unavailable." }, 503);
      }

      let transactionResponse: Response;
      try {
        transactionResponse = await fetch(
          "https://api.paystack.co/transaction/verify/" + encodeURIComponent(paymentReference),
          { headers: { Authorization: "Bearer " + paystackSecret } },
        );
      } catch (error) {
        console.error("Paystack transaction verification request failed:", error);
        return json({ error: "Could not verify the refunded transaction." }, 503);
      }

      const transactionPayload = await transactionResponse.json().catch(() => null);
      const transaction = transactionPayload?.data;
      if (
        !transactionResponse.ok ||
        transactionPayload?.status !== true ||
        transaction?.reference !== paymentReference ||
        transaction?.status !== "success" ||
        String(transaction?.currency || "").toUpperCase() !== "NGN" ||
        !Number.isSafeInteger(Number(transaction?.id)) ||
        Number(transaction?.id) <= 0 ||
        !Number.isSafeInteger(Number(transaction?.amount)) ||
        Number(transaction?.amount) <= 0
      ) {
        console.error("Invalid original transaction for refund:", paymentReference);
        return json({ error: "Original transaction verification failed." }, 400);
      }

      const refundServiceClient = createClient(refundSupabaseUrl, refundServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: payment, error: paymentLookupError } = await refundServiceClient
        .from("payments")
        .select("id,amount,currency,status")
        .eq("reference", paymentReference)
        .maybeSingle();

      if (paymentLookupError) {
        console.error("Could not look up refunded payment:", paymentLookupError.message);
        return json({ error: "Refund payment lookup failed." }, 500);
      }

      const expectedPaymentAmountKobo = Math.round(Number(payment?.amount) * 100);
      if (
        !payment ||
        !["success", "refunded"].includes(payment.status) ||
        payment.currency !== "NGN" ||
        !Number.isSafeInteger(expectedPaymentAmountKobo) ||
        Number(transaction.amount) !== expectedPaymentAmountKobo
      ) {
        console.error("Refund transaction did not match the stored payment:", paymentReference);
        return json({ error: "Refund transaction details do not match the stored payment." }, 400);
      }

      let totalProcessedRefundAmountKobo = 0;
      let refundPage = 1;
      let totalRefundPages = 1;
      let processedRefundCount = 0;
      do {
        const refundUrl = new URL("https://api.paystack.co/refund");
        refundUrl.searchParams.set("transaction", String(transaction.id));
        refundUrl.searchParams.set("currency", "NGN");
        refundUrl.searchParams.set("perPage", "100");
        refundUrl.searchParams.set("page", String(refundPage));

        let refundResponse: Response;
        try {
          refundResponse = await fetch(refundUrl.toString(), {
            headers: { Authorization: "Bearer " + paystackSecret },
          });
        } catch (error) {
          console.error("Paystack refund lookup request failed:", error);
          return json({ error: "Could not retrieve refund records." }, 503);
        }

        const refundList = await refundResponse.json().catch(() => null);
        if (!refundResponse.ok || refundList?.status !== true || !Array.isArray(refundList?.data)) {
          console.error("Paystack refund lookup failed:", refundResponse.status);
          return json({ error: "Refund records could not be verified." }, 503);
        }

        for (const refundRecord of refundList.data) {
          if (refundRecord?.status !== "processed" ||
              String(refundRecord?.currency || "").toUpperCase() !== "NGN") continue;

          const refundId = refundRecord?.id === undefined || refundRecord?.id === null
            ? ""
            : String(refundRecord.id);
          const refundAmount = Number(refundRecord.amount);
          if (!refundId || refundId.length > 100 ||
              !Number.isSafeInteger(refundAmount) || refundAmount <= 0) {
            console.error("Invalid processed refund record:", refundRecord?.id);
            return json({ error: "A refund record contains invalid details." }, 500);
          }

          totalProcessedRefundAmountKobo += refundAmount;
          if (!Number.isSafeInteger(totalProcessedRefundAmountKobo) ||
              totalProcessedRefundAmountKobo > expectedPaymentAmountKobo) {
            return json({ error: "Cumulative refund amount exceeds the original payment." }, 400);
          }

          const { data: reversal, error: reversalError } = await refundServiceClient.rpc(
            "reverse_referral_reward",
            {
              p_payment_reference: paymentReference,
              p_refund_id: refundId,
              p_refund_amount_kobo: refundAmount,
            },
          );
          if (reversalError || !isRefundEventRecorded(reversal)) {
            console.error(
              "Could not record verified Paystack refund:",
              reversalError?.message || reversal,
            );
            return json({ error: "Verified refund could not be recorded." }, 500);
          }
          processedRefundCount++;
        }

        totalRefundPages = Number(refundList.meta?.pageCount ?? 1);
        if (!Number.isSafeInteger(totalRefundPages) ||
            totalRefundPages < 1 || refundPage > totalRefundPages) {
          return json({ error: "Invalid refund pagination response." }, 500);
        }
        refundPage++;
      } while (refundPage <= totalRefundPages);

      if (processedRefundCount === 0 || totalProcessedRefundAmountKobo === 0) {
        return json({ error: "No processed refund records were found yet." }, 503);
      }

      console.info("Paystack refund reconciliation completed:", paymentReference, {
        processedRefundCount,
        totalProcessedRefundAmountKobo,
      });
      return json({
        received: true,
        processed_refund_count: processedRefundCount,
        total_refunded_kobo: totalProcessedRefundAmountKobo,
      });
    }

    // Ignore other Paystack events.
    if (event?.event !== "charge.success") {
      return json({ received: true });
    }

    // Process successful customer payments.
    const transaction = event?.data;

    const reference =
      typeof transaction?.reference === "string"
        ? transaction.reference
        : "";

    if (
      !reference ||
      transaction?.status !== "success" ||
      transaction?.currency !== "NGN"
    ) {
      return json({
        error: "Invalid successful-payment event.",
      }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      console.error(
        "Paystack webhook is missing Supabase service configuration.",
      );
      return json({
        error: "Webhook is temporarily unavailable.",
      }, 503);
    }

    const serviceClient = createClient(
      supabaseUrl,
      serviceKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data: payment, error: lookupError } =
      await serviceClient
        .from("payments")
        .select("id, user_id, amount, currency, status")
        .eq("reference", reference)
        .maybeSingle();

    if (lookupError) {
      console.error(
        "Webhook payment lookup failed:",
        lookupError.message,
      );
      return json({ error: "Payment lookup failed." }, 500);
    }

    if (!payment) {
      console.error(
        "Webhook reference has no matching pending payment:",
        reference,
      );
      return json({ error: "Unknown payment reference." }, 404);
    }

    const expectedAmount = Math.round(Number(payment.amount) * 100);
    const webhookPaidAmount = Number(transaction.amount);

    if (
      !Number.isSafeInteger(webhookPaidAmount) ||
      webhookPaidAmount !== expectedAmount ||
      payment.currency !== "NGN" ||
      (
        transaction.metadata?.user_id &&
        transaction.metadata.user_id !== payment.user_id
      )
    ) {
      console.error(
        "Webhook amount, currency or owner mismatch:",
        reference,
      );
      return json({
        error: "Payment details did not match the order.",
      }, 400);
    }

    if (payment.status === "refunded") {
      return json({
        received: true,
        ignored: "payment_already_refunded",
      });
    }

    const { data: confirmation, error: confirmationError } =
      await serviceClient.rpc(
        "confirm_paystack_payment",
        {
          p_reference: reference,
          p_amount_kobo: webhookPaidAmount,
          p_currency: transaction.currency,
        },
      );

    if (confirmationError) {
      console.error(
        "Webhook payment confirmation failed:",
        confirmationError.message,
      );
      return json({ error: "Could not record payment." }, 500);
    }

    if (confirmation?.confirmed !== true) {
      console.error(
        "Database rejected the verified Paystack payment:",
        reference,
        confirmation?.reason,
      );
      return json({
        error: "Payment details did not match the order.",
      }, 400);
    }

    // Credit a referral commission only after the matching payment is verified.
    // The database RPC is idempotent, so repeated Paystack webhooks cannot double-credit.
    const { data: referralResult, error: referralError } =
      await serviceClient.rpc(
        "credit_referral_reward",
        { p_payment_id: payment.id },
      );

    if (referralError) {
      console.error(
        "Referral reward processing failed:",
        referralError.message,
      );
      return json({
        error: "Payment recorded; referral reward processing will retry.",
      }, 500);
    }

    if (referralResult?.credited) {
      console.info(
        "Referral reward credited:",
        referralResult.reward_id,
      );
    }

    return json({ received: true });
  } catch (error) {
    console.error("Paystack webhook processing failed:", error);
    return json({ error: "Webhook processing failed." }, 500);
  }
});
