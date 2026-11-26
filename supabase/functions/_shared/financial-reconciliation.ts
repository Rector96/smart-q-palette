type RpcResult = Record<string, unknown>;

const asRpcResult = (result: unknown): RpcResult | null =>
  typeof result === "object" && result !== null && !Array.isArray(result)
    ? result as RpcResult
    : null;

export const isTransferSettlementRecorded = (result: unknown, expectedOutcome: string) => {
  const outcome = asRpcResult(result);
  return outcome !== null &&
    (outcome.updated === true && outcome.status === expectedOutcome ||
      outcome.reason === "already_processed");
};

export const isRefundEventRecorded = (result: unknown) => {
  const outcome = asRpcResult(result);
  return outcome !== null && (
    outcome.reversed === true && outcome.payment_refunded === true ||
    outcome.reason === "partial_refund" && outcome.recorded === true ||
    outcome.reason === "already_processed" ||
    outcome.reason === "already_reversed" && outcome.payment_refunded === true ||
    outcome.reason === "no_referral_reward" && outcome.payment_refunded === true
  );
};
