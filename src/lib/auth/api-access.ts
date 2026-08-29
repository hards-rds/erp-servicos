import "server-only";

import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";

export type PermissionAction =
  | "visualizar"
  | "criar"
  | "editar"
  | "excluir"
  | "aprovar"
  | "cancelar"
  | "emitir"
  | "conciliar"
  | "configurar";

type CompanyAccessOptions = {
  module: string;
  action: PermissionAction;
  segment?: string;
  roles?: string[];
};

export type CompanyAccess = Awaited<ReturnType<typeof requireCompanyPermission>>;

export async function requireCompanyPermission(options: CompanyAccessOptions) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, reason: "unauthorized" as const, supabase };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,tenant_id,company_id,role,active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.company_id || !profile.tenant_id || profile.active === false) {
    return { ok: false as const, reason: "profile" as const, supabase };
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id,tenant_id,service_segment,active")
    .eq("id", profile.company_id)
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();

  if (companyError || !company || company.active === false) {
    return { ok: false as const, reason: "company" as const, supabase };
  }

  if (options.segment && company.service_segment !== options.segment) {
    return { ok: false as const, reason: "segment" as const, supabase };
  }

  if (options.roles && !options.roles.includes(String(profile.role))) {
    return { ok: false as const, reason: "forbidden" as const, supabase };
  }

  const { data: allowed, error: permissionError } = await supabase.rpc("app_has_permission", {
    permission_module: options.module,
    permission_action: options.action
  });

  if (permissionError || allowed !== true) {
    return { ok: false as const, reason: "forbidden" as const, supabase };
  }

  return {
    ok: true as const,
    supabase,
    user,
    profile: {
      id: profile.id as string,
      tenant_id: profile.tenant_id as string,
      company_id: profile.company_id as string,
      role: profile.role as string
    },
    company: {
      id: company.id as string,
      tenant_id: company.tenant_id as string,
      service_segment: company.service_segment as string
    }
  };
}

export async function writeCompanyAudit(input: {
  companyId: string;
  actorId: string;
  entity: string;
  entityId?: string | null;
  action: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const service = createServiceClient();
    const { error } = await service.from("audit_logs").insert({
      company_id: input.companyId,
      actor_id: input.actorId,
      entity: input.entity,
      entity_id: input.entityId || null,
      action: input.action,
      reason: input.reason || null,
      metadata: input.metadata || {}
    });

    if (error) console.error("audit_log_write_failed", { entity: input.entity, action: input.action });
  } catch {
    console.error("audit_log_write_failed", { entity: input.entity, action: input.action });
  }
}
