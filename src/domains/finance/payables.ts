const settledStatuses = new Set(["pago", "conciliado"]);
const payableStatuses = new Set(["previsto", "aprovado", "vencido"]);

export function canEditPayable(status: string) {
  return !settledStatuses.has(status);
}

export function canMarkPayablePaid(status: string) {
  return payableStatuses.has(status);
}

export function getPayableMutationBlocker(input: {
  status: string;
  commissionCount: number;
  reconciliationCount: number;
}) {
  if (settledStatuses.has(input.status)) return "settled" as const;
  if (input.commissionCount > 0 || input.reconciliationCount > 0) return "linked" as const;
  return null;
}
