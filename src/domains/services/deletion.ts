const deletableStatuses = new Set(["rascunho", "cancelado"]);

export type ServiceDeletionBlock = "service_active" | "financial_entry" | null;

export function canDeleteServiceStatus(status: string) {
  return deletableStatuses.has(status);
}

export function serviceDeletionBlock(status: string, hasFinancialEntry: boolean): ServiceDeletionBlock {
  if (!canDeleteServiceStatus(status)) return "service_active";
  if (hasFinancialEntry) return "financial_entry";
  return null;
}
