import "server-only";

import type { PermissionAction } from "@/lib/auth/api-access";
import { requireCompanyPermission } from "@/lib/auth/api-access";

export function getTransportContext(module: "frota" | "motoristas" | "viagens" | "cte", action: PermissionAction = "visualizar") {
  return requireCompanyPermission({
    module: module === "cte" ? "fiscal.cte" : `transporte.${module}`,
    action,
    segment: "transportadora"
  });
}

export function transportRedirectStatus(reason: string) {
  return reason === "segment" ? "wrong_segment" : reason === "forbidden" ? "forbidden" : "profile_error";
}
