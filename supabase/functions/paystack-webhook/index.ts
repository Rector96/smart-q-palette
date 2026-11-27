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
      const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
      if (!supabaseUrl || !serviceKey || !paystackSecret) {
        return json({ error: "Webhook is temporarily unavailable." }, 503);
      }

      const serviceClient = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: withdrawal, error: withdrawalLookupError } = await serviceClient
        .from("referral_withdrawals")
        .select("id,amount,currency,status,reference")
        .eq("reference", transferReference)
        .maybeSingle();

      if (withdrawalLookupError) {
        console.error("Could not look up referral transfer:", withdrawalLookupError.message);
        return json({ error: "Withdrawal lookup is temporarily unavailable." }, 503);
      }
      if (!withdrawal) {
        if (transferReference.toLowerCase().startsWith("sqprwd-")) {
          console.error("Referral transfer has no matching withdrawal:", transferReference);
          return json({ error: "Matching referral withdrawal was not found." }, 404);
        }
        return json({ received: true, ignored: true });
      }

      const expectedAmountKobo = Math.round(Number(withdrawal.amount) * 100);
      if (
        withdrawal.reference !== transferReference ||
        withdrawal.currency !== "NGN" ||
        !Number.isSafeInteger(expectedAmountKobo) ||
        Number(transfer.amount) !== expectedAmountKobo ||
        transfer.currency !== withdrawal.currency
      ) {
        console.error("Transfer event did not match the stored withdrawal:", transferReference);
        return json({ error: "Transfer details do not match the stored withdrawal." }, 400);
      }

      let verifyResponse: Response;
      try {
        verifyResponse = await fetch(
          "https://api.paystack.co/transfer/verify/" + encodeURIComponent(transferReference),
          { headers: { Authorization: "Bearer " + paystackSecret } },
        );
      } catch (error) {
        console.error("Paystack transfer verification request failed:", error);
        return json({ error: "Transfer verification is temporarily unavailable." }, 503);
      }

      const verifyPayload = await verifyResponse.json().catch(() => null);
      if (!verifyResponse.ok || verifyPayload?.status !== true || !verifyPayload?.data) {
        console.error("Paystack transfer verification was inconclusive:", transferReference, verifyResponse.status);
        return json({
          error: "Transfer could not be independently verified. Funds remain reserved.",
        }, 503);
      }

      const verifiedTransfer = verifyPayload.data;
      const verifiedStatus = String(verifiedTransfer.status || "").toLowerCase();
      if (
        verifiedTransfer.reference !== withdrawal.reference ||
        Number(verifiedTransfer.amount) !== expectedAmountKobo ||
        verifiedTransfer.currency !== withdrawal.currency
      ) {
        console.error("Verified Paystack transfer did not match the withdrawal:", transferReference);
        return json({ error: "Verified transfer details do not match the stored withdrawal." }, 503);
      }

      if (verifiedStatus !== transferOutcome) {
        console.warn("Transfer status is not yet consistent:", transferReference, transferOutcome, verifiedStatus);
        return json({
          error: "Transfer outcome is not yet confirmed. Funds remain reserved.",
        }, 503);
      }

      const { data: settlement, error: settlementError } = await serviceClient.rpc(
        "settle_referral_withdrawal",
        {
          p_reference: transferReference,
          p_outcome: transferOutcome,
          p_transfer_code: typeof verifiedTransfer.transfer_code === "string"
            ? verifiedTransfer.transfer_code
            : null,
          p_failure_reason: transferOutcome === "success"
            ? null
            : typeof verifiedTransfer.failures === "string"
              ? verifiedTransfer.failures
              : "Paystack confirmed transfer " + transferOutcome + ".",
        },
      );

      if (settlementError) {
        console.error("Referral transfer settlement failed:", settlementError.message);
        return json({ error: "Transfer outcome could not be recorded." }, 500);
      }

      if (settlement?.updated !== true) {
        const { data: currentWithdrawal, error: currentStatusError } = await serviceClient
          .from("referral_withdrawals")
          .select("status")
          .eq("id", withdrawal.id)
          .maybeSingle();

        if (currentStatusError) {
          console.error("Could not confirm duplicate transfer settlement:", currentStatusError.message);
          return json({ error: "Transfer settlement status could not be confirmed." }, 500);
        }
        if (
          settlement?.reason !== "already_processed" ||
          currentWithdrawal?.status !== transferOutcome
        ) {
          console.error(
            "Verified transfer conflicted with the stored withdrawal state:",
            transferReference,
            settlement,
            currentWithdrawal?.status,
          );
          return json({ error: "Transfer outcome conflicts with the stored withdrawal state." }, 409);
        }
      }

      console.info("Verified referral transfer processed:", transferReference, verifiedStatus);
      return json({ received: true });
    }

    if (event?.event === "refund.processed") {
      const refund = event?.data || {};
      const paymentReference =
        typeof refund.transaction_reference === "string"
          ? refund.transaction_reference
          : typeof refund.transaction?.reference === "string"
            ? refund.transaction.reference
            : "";

      if (!paymentReference) {
        console.error("Refund webhook has no transaction reference.");
        return json({ error: "Refund transaction reference is missing." }, 400);
      }

      const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!paystackSecret || !supabaseUrl || !serviceKey) {
        return json({ error: "Webhook is temporarily unavailable." }, 503);
      }

      // Verify the original transaction and retrieve the authoritative list of
      // processed refunds. Do not trust a partial webhook payload as the ledger.
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
        String(transaction?.currency || "").toUpperCase() !== "NGN" ||
        !Number.isSafeInteger(Number(transaction?.id))
      ) {
        console.error("Invalid original transaction for refund:", paymentReference);
        return json({ error: "Original transaction verification failed." }, 400);
      }

      const serviceClient = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: payment, error: paymentLookupError } = await serviceClient
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
        !["success", "partially_refunded", "refunded"].includes(payment.status) ||
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
          if (refundRecord?.status !== "processed" || refundRecord?.currency !== "NGN") continue;
          const refundId = refundRecord?.id === undefined || refundRecord?.id === null
            ? ""
            : String(refundRecord.id);
          const refundAmount = Number(refundRecord.amount);
          if (!refundId || !Number.isSafeInteger(refundAmount) || refundAmount <= 0) {
            console.error("Invalid processed refund record:", refundRecord?.id);
            return json({ error: "A refund record contains invalid details." }, 500);
          }

          totalProcessedRefundAmountKobo += refundAmount;
          if (!Number.isSafeInteger(totalProcessedRefundAmountKobo) ||
              totalProcessedRefundAmountKobo > expectedPaymentAmountKobo) {
            return json({ error: "Cumulative refund amount exceeds the original payment." }, 400);
          }

          const { data: refundResult, error: refundError } = await serviceClient.rpc(
            "record_paystack_refund",
            {
              p_payment_reference: paymentReference,
              p_provider_refund_id: refundId,
              p_refund_amount_kobo: refundAmount,
              p_currency: "NGN",
            },
          );
          if (refundError || refundResult?.recorded !== true) {
            console.error("Could not record verified Paystack refund:", refundError?.message || refundResult);
            return json({ error: "Verified refund could not be recorded." }, 500);
          }
          processedRefundCount++;
        }

        totalRefundPages = Number(refundList.meta?.pageCount ?? 1);
        if (!Number.isSafeInteger(totalRefundPages) || totalRefundPages < 1 || refundPage > totalRefundPages) {
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

    // A delayed charge.success delivery must never undo a processed refund.
    if (payment.status === "partially_refunded" || payment.status === "refunded") {
      console.info("Ignoring stale charge.success for refunded payment:", reference, payment.status);
      return json({ received: true, ignored: true, reason: "payment_already_refunded" });
    }

    const expectedAmount = Math.round(Number(payment.amount) * 100);
    const webhookRequestedAmount = Number(transaction.requested_amount ?? transaction.amount);
    const metadata = transaction.metadata && typeof transaction.metadata === "object"
      ? transaction.metadata
      : {};
    const metadataUserId = typeof metadata.user_id === "string" ? metadata.user_id : "";
    if (
      !Number.isSafeInteger(expectedAmount) ||
      !Number.isSafeInteger(webhookRequestedAmount) ||
      webhookRequestedAmount !== expectedAmount ||
      String(payment.currency || "").toUpperCase() !== "NGN" ||
      String(transaction.currency || "").toUpperCase() !== "NGN" ||
      (metadataUserId && metadataUserId !== payment.user_id)
    ) {
      console.error("Webhook amount, currency or owner mismatch:", reference);
      return json({ error: "Payment details did not match the order." }, 400);
    }

    const { data: confirmation, error: confirmationError } = await serviceClient.rpc(
      "confirm_paystack_payment",
      {
        p_reference: reference,
        p_amount_kobo: expectedAmount,
        p_currency: "NGN",
      },
    );
    if (confirmationError) {
      console.error("Webhook could not atomically confirm payment:", confirmationError.message);
      return json({ error: "Could not record payment confirmation." }, 500);
    }
    if (confirmation?.confirmed !== true) {
      console.warn("Verified payment was not activated:", reference, confirmation?.reason);
      return json({ received: true, ignored: true, reason: confirmation?.reason || "payment_not_confirmed" });
    }
    console.info("Payment confirmed atomically:", reference, confirmation.referral);
    return json({ received: true });
  } catch (error) {
    console.error("Paystack webhook processing failed:", error);
    return json({ error: "Webhook processing failed." }, 500);
  }
});
