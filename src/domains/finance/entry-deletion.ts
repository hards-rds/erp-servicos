export type FinancialEntryDeletionContext = {
  status: string;
  receivedAt: string | null;
  nfseDocumentId: string | null;
  chargeId: string | null;
  nfseCount: number;
  chargeCount: number;
  reconciliationCount: number;
  saleCount: number;
};

export type FinancialEntryDeletionBlocker = "settled" | "linked" | null;

export function getFinancialEntryDeletionBlocker(
  context: FinancialEntryDeletionContext
): FinancialEntryDeletionBlocker {
  if (context.receivedAt || ["recebido", "conciliado"].includes(context.status)) return "settled";

  if (
    context.nfseDocumentId
    || context.chargeId
    || context.nfseCount > 0
    || context.chargeCount > 0
    || context.reconciliationCount > 0
    || context.saleCount > 0
  ) return "linked";

  return null;
}
