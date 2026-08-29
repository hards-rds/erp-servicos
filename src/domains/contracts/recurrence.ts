import { dueDateForCompetence } from "../../lib/dates/competence.ts";
import type { Contract, FinancialEntryDraft } from "./types";

const PERIODICITY_MONTHS = {
  mensal: 1,
  trimestral: 3,
  semestral: 6,
  anual: 12
} as const;

function monthIndex(value: string) {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  return year * 12 + month - 1;
}

export function isRecurringCompetenceDue(
  contract: Pick<Contract, "startsAt" | "endsAt" | "periodicity" | "status">,
  competence: string
) {
  if (contract.status !== "ativo" || !/^\d{4}-\d{2}$/.test(competence)) return false;
  const competenceStart = `${competence}-01`;
  const competenceEnd = dueDateForCompetence(competence, 31);
  if (contract.startsAt > competenceEnd || (contract.endsAt && contract.endsAt < competenceStart)) return false;

  const elapsedMonths = monthIndex(competence) - monthIndex(contract.startsAt);
  return elapsedMonths >= 0 && elapsedMonths % PERIODICITY_MONTHS[contract.periodicity] === 0;
}

export function recurringEntryKey(contractId: string, competence: string, dueDate: string): string {
  return `contract:${contractId}:competence:${competence}:due:${dueDate}`;
}

export function generateRecurringEntry(contract: Contract, competence: string): FinancialEntryDraft {
  if (contract.status !== "ativo") {
    throw new Error("Somente contrato ativo pode gerar entrada recorrente.");
  }
  const dueDate = dueDateForCompetence(competence, contract.dueDay);
  return {
    idempotencyKey: recurringEntryKey(contract.id, competence, dueDate),
    clientId: contract.clientId,
    contractId: contract.id,
    description: contract.serviceDescription,
    competence,
    dueDate,
    grossAmountCents: contract.recurringAmountCents,
    netAmountCents: contract.recurringAmountCents,
    status: "previsto"
  };
}
