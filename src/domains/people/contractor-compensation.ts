export type ContractorCompensationInput = {
  fixedAmount: number;
  costAllowanceAmount: number;
  commissionRate: number;
  commissionItems: number[];
  adjustments?: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateContractorCompensation(input: ContractorCompensationInput) {
  const commissionBase = roundMoney(input.commissionItems.reduce((sum, value) => sum + value, 0));
  const commissionAmount = roundMoney(commissionBase * input.commissionRate / 100);
  const totalAmount = roundMoney(
    input.fixedAmount + input.costAllowanceAmount + commissionAmount + (input.adjustments || 0)
  );

  return { commissionBase, commissionAmount, totalAmount };
}

export function contractorCommissionBasisLabel(value: string) {
  return value === "received" ? "Contratos recebidos no mes" : "Contratos previstos no mes";
}
