export type CommissionStatus = "pendente" | "aprovada" | "paga" | "cancelada";

export function calculateCommissionAmount(baseAmount: number, ratePercent: number) {
  if (!Number.isFinite(baseAmount) || baseAmount < 0) throw new Error("Base da comissao invalida.");
  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
    throw new Error("Percentual da comissao deve estar entre 0 e 100.");
  }

  const amount = baseAmount * ratePercent / 100;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

const transitions: Record<CommissionStatus, CommissionStatus[]> = {
  pendente: ["aprovada", "cancelada"],
  aprovada: ["paga", "cancelada"],
  paga: [],
  cancelada: []
};

export function canTransitionCommission(from: CommissionStatus, to: CommissionStatus) {
  return transitions[from].includes(to);
}

export function assertCommissionTransition(from: CommissionStatus, to: CommissionStatus) {
  if (!canTransitionCommission(from, to)) {
    throw new Error(`Transicao de comissao invalida: ${from} para ${to}.`);
  }
}
