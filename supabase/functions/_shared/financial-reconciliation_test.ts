import {
  isRefundEventRecorded,
  isTransferSettlementRecorded,
} from "./financial-reconciliation.ts";

Deno.test("transfer settlement requires the expected recorded status", () => {
  if (!isTransferSettlementRecorded({ updated: true, status: "success" }, "success")) {
    throw new Error("A recorded matching transfer outcome should be accepted.");
  }
  if (!isTransferSettlementRecorded({ updated: false, reason: "already_processed" }, "success")) {
    throw new Error("An idempotent transfer result should be accepted.");
  }
  if (isTransferSettlementRecorded({ updated: true, status: "failed" }, "success")) {
    throw new Error("A different recorded transfer outcome must not be accepted.");
  }
  if (isTransferSettlementRecorded({ updated: false, reason: "withdrawal_not_found" }, "success")) {
    throw new Error("An unknown withdrawal must remain unresolved.");
  }
});

Deno.test("refund handling accepts only recorded partial or completed outcomes", () => {
  if (!isRefundEventRecorded({ reason: "partial_refund", recorded: true })) {
    throw new Error("A recorded partial refund should be accepted.");
  }
  if (!isRefundEventRecorded({ reversed: true, payment_refunded: true })) {
    throw new Error("A full refund with completed reward recovery should be accepted.");
  }
  if (!isRefundEventRecorded({ reason: "no_referral_reward", payment_refunded: true })) {
    throw new Error("A payment refund without a referral reward should be accepted.");
  }
  if (!isRefundEventRecorded({ reason: "already_processed" })) {
    throw new Error("A duplicate Paystack refund event should be accepted idempotently.");
  }
  if (!isRefundEventRecorded({ reason: "already_reversed", payment_refunded: true })) {
    throw new Error("An already-reversed fully refunded payment should be accepted.");
  }
  if (isRefundEventRecorded({ reason: "payment_not_found" })) {
    throw new Error("An unknown payment must remain unresolved.");
  }
  if (isRefundEventRecorded({ reason: "partial_refund", recorded: false })) {
    throw new Error("An unrecorded partial refund must remain unresolved.");
  }
  if (isRefundEventRecorded({ reversed: true, payment_refunded: false })) {
    throw new Error("Reward reversal without payment refund state must remain unresolved.");
  }
});
