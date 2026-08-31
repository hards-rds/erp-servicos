export type PayableScheduleType = "single" | "installment" | "fixed";

export function isPayableScheduleType(value: string): value is PayableScheduleType {
  return ["single", "installment", "fixed"].includes(value);
}

export function addMonthsToCompetence(competence: string, months: number) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competence)) throw new Error("Competencia invalida.");
  const [year, month] = competence.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function splitInstallmentAmount(totalAmount: number, installmentCount: number) {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) throw new Error("Valor total invalido.");
  if (!Number.isInteger(installmentCount) || installmentCount < 2 || installmentCount > 120) {
    throw new Error("Quantidade de parcelas invalida.");
  }

  const totalCents = Math.round(totalAmount * 100);
  if (totalCents < installmentCount) throw new Error("O valor total precisa permitir parcelas de pelo menos um centavo.");
  const baseCents = Math.floor(totalCents / installmentCount);
  const remainder = totalCents % installmentCount;
  return Array.from({ length: installmentCount }, (_, index) => (
    (baseCents + (index < remainder ? 1 : 0)) / 100
  ));
}

export function payableScheduleLabel(input: {
  type: PayableScheduleType;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
}) {
  if (input.type === "fixed") return "Fixa mensal";
  if (input.type === "installment") {
    return `Parcela ${input.installmentNumber || "-"}/${input.installmentTotal || "-"}`;
  }
  return "Avulsa";
}
