export type PermissionAction = "visualizar" | "criar" | "editar" | "excluir" | "aprovar" | "cancelar" | "emitir" | "conciliar" | "configurar";

export type Permission = `${string}:${PermissionAction}`;

export type UserAccess = {
  userId: string;
  role: "usuario" | "admin" | "master";
  permissions: Permission[];
};

export function can(access: UserAccess, permission: Permission): boolean {
  if (access.role === "master") return true;
  if (access.permissions.includes(permission)) return true;
  return access.role === "admin" && permission.endsWith(":visualizar");
}

export function assertCannotChangeOwnElevation(actorId: string, targetUserId: string, requestedPermissions: Permission[]): void {
  const elevationPermissions = requestedPermissions.filter((permission) => permission.endsWith(":configurar"));
  if (actorId === targetUserId && elevationPermissions.length > 0) {
    throw new Error("Usuario nao pode elevar a propria permissao administrativa.");
  }
}
