export type AuditEvent = {
  companyId: string;
  actorId: string;
  entity: string;
  entityId: string;
  action: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export function createAuditEvent(input: Omit<AuditEvent, "createdAt">): AuditEvent {
  return {
    ...input,
    createdAt: new Date().toISOString()
  };
}
