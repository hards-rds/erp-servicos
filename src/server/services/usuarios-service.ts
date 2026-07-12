import { assertCannotChangeOwnElevation, type Permission } from "@/domains/users/permissions";
import { createAuditEvent } from "@/lib/audit/audit-event";

export function planUserPermissionUpdate(input: {
  actorId: string;
  targetUserId: string;
  permissions: Permission[];
  companyId: string;
}) {
  assertCannotChangeOwnElevation(input.actorId, input.targetUserId, input.permissions);
  return createAuditEvent({
    companyId: input.companyId,
    actorId: input.actorId,
    entity: "user_permissions",
    entityId: input.targetUserId,
    action: "update_permissions",
    metadata: { permissions: input.permissions }
  });
}
