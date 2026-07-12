import { planRecurringEntries } from "@/server/services/recorrencia-service";
import type { Contract } from "@/domains/contracts/types";

export function dryRunRecurrenceJob(contracts: Contract[], competence: string, existingKeys: string[]) {
  return planRecurringEntries(contracts, competence, new Set(existingKeys));
}
