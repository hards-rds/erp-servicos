import { dueDateForCompetence } from "../../lib/dates/competence.ts";
import type { Contract, FinancialEntryDraft } from "./types";

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
