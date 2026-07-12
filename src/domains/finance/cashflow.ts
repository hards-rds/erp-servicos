import type { FinancialEntry, Payable } from "./types";

export type CashflowSummary = {
  expectedIncomeCents: number;
  receivedIncomeCents: number;
  expectedExpenseCents: number;
  paidExpenseCents: number;
  projectedBalanceCents: number;
  realizedBalanceCents: number;
};

export function summarizeCashflow(entries: FinancialEntry[], payables: Payable[]): CashflowSummary {
  const expectedIncomeCents = entries
    .filter((entry) => !["cancelado"].includes(entry.status))
    .reduce((sum, entry) => sum + entry.netAmountCents, 0);
  const receivedIncomeCents = entries
    .filter((entry) => ["recebido", "conciliado"].includes(entry.status))
    .reduce((sum, entry) => sum + entry.netAmountCents, 0);
  const expectedExpenseCents = payables
    .filter((payable) => !["cancelado"].includes(payable.status))
    .reduce((sum, payable) => sum + payable.amountCents, 0);
  const paidExpenseCents = payables
    .filter((payable) => ["pago", "conciliado"].includes(payable.status))
    .reduce((sum, payable) => sum + payable.amountCents, 0);

  return {
    expectedIncomeCents,
    receivedIncomeCents,
    expectedExpenseCents,
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
