import type { FinancialEntry, Payable } from "./types";

export type CashflowSummary = {
  expectedIncomeCents: number;
  receivedIncomeCents: number;
  expectedExpenseCents: number;
  pendingCommissionExpenseCents: number;
  paidExpenseCents: number;
  projectedBalanceCents: number;
  realizedBalanceCents: number;
};

export type CashflowCommission = {
  commissionAmountCents: number;
  status: "pendente" | "aprovada" | "paga" | "cancelada";
  payableId?: string | null;
};

export function isStandalonePendingCommission(commission: CashflowCommission) {
  return commission.status === "pendente" && !commission.payableId;
}

export function summarizeCashflow(
  entries: FinancialEntry[],
  payables: Payable[],
  commissions: CashflowCommission[] = []
): CashflowSummary {
  const expectedIncomeCents = entries
    .filter((entry) => !["cancelado"].includes(entry.status))
    .reduce((sum, entry) => sum + entry.netAmountCents, 0);
  const receivedIncomeCents = entries
    .filter((entry) => ["recebido", "conciliado"].includes(entry.status))
    .reduce((sum, entry) => sum + entry.netAmountCents, 0);
  const payableExpenseCents = payables
    .filter((payable) => !["cancelado"].includes(payable.status))
    .reduce((sum, payable) => sum + payable.amountCents, 0);
  const pendingCommissionExpenseCents = commissions
    .filter(isStandalonePendingCommission)
    .reduce((sum, commission) => sum + commission.commissionAmountCents, 0);
  const expectedExpenseCents = payableExpenseCents + pendingCommissionExpenseCents;
  const paidExpenseCents = payables
    .filter((payable) => ["pago", "conciliado"].includes(payable.status))
    .reduce((sum, payable) => sum + payable.amountCents, 0);

  return {
    expectedIncomeCents,
    receivedIncomeCents,
    expectedExpenseCents,
    pendingCommissionExpenseCents,
    paidExpenseCents,
    projectedBalanceCents: expectedIncomeCents - expectedExpenseCents,
    realizedBalanceCents: receivedIncomeCents - paidExpenseCents
  };
}

export function assertPayableCanBeMarkedPaid(payable: Pick<Payable, "paidAt" | "amountCents">): void {
  if (!payable.paidAt || payable.amountCents <= 0) {
    throw new Error("Saida paga exige data de pagamento e valor.");
  }
}
