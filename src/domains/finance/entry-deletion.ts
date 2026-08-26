export type FinancialEntryDeletionContext = {
  status: string;
  receivedAt: string | null;
  nfseCount: number;
  chargeCount: number;
  reconciliationCount: number;
  saleCount: number;
};

export type FinancialEntryDeletionBlocker = "settled" | "nfse" | "charge" | "reconciliation" | "sale" | null;

const protectedNfseStatuses = new Set(["enviada", "autorizada", "cancelada"]);
const settledChargeStatuses = new Set(["paga", "conciliada"]);

export function isProtectedNfseForEntryDeletion(status: string, hasAuthorizedXml: boolean) {
  return hasAuthorizedXml || protectedNfseStatuses.has(status);
}

export function isProtectedInterChargeForEntryDeletion(status: string, hasExternalId: boolean) {
  if (settledChargeStatuses.has(status)) return true;
  if (status === "cancelada") return false;
  return hasExternalId;
}

export function getFinancialEntryDeletionBlocker(
  context: FinancialEntryDeletionContext
): FinancialEntryDeletionBlocker {
  if (context.receivedAt || ["recebido", "conciliado"].includes(context.status)) return "settled";

  if (context.nfseCount > 0) return "nfse";
  if (context.chargeCount > 0) return "charge";
  if (context.reconciliationCount > 0) return "reconciliation";
  if (context.saleCount > 0) return "sale";

  return null;
}
