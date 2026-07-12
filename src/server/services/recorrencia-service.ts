import { generateRecurringEntry } from "@/domains/contracts/recurrence";
import type { Contract } from "@/domains/contracts/types";

export function planRecurringEntries(contracts: Contract[], competence: string, existingKeys: Set<string>) {
  return contracts
    .filter((contract) => contract.status === "ativo")
    .map((contract) => generateRecurringEntry(contract, competence))
    .filter((entry) => !existingKeys.has(entry.idempotencyKey));
}
