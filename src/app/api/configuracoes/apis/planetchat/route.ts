import { NextRequest, NextResponse } from "next/server";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";
import { testPlanetChatConnection } from "@/lib/integrations/planetchat-client";
import {
  decryptPlanetChatCredentials,
  encryptPlanetChatCredentials
} from "@/lib/integrations/planetchat-credentials";
import { createServiceClient } from "@/lib/supabase/server";
import { tenantHasFeature } from "@/server/services/saas-plan-service";

export const runtime = "nodejs";

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/configuracoes/apis/planetchat?status=${status}`, request.url), 303);
}

export async function POST(request: NextRequest) {
  const access = await requireCompanyPermission({ module: "configuracoes.apis", action: "configurar", segment: "tecnologia", roles: ["master", "system_admin"] });
  if (!access.ok) {
    if (access.reason === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
    if (access.reason === "segment") return redirectWith(request, "segment_error");
    return redirectWith(request, access.reason === "forbidden" ? "forbidden" : "profile_error");
  }
  const { profile } = access;
  if (!(await tenantHasFeature(profile.tenant_id, "api_integrations"))) return redirectWith(request, "plan_feature");

  const formData = await request.formData();
  const tokenInput = String(formData.get("token") || "").trim();
  const defaultSyncDays = Number.parseInt(String(formData.get("defaultSyncDays") || "30"), 10);
  const active = formData.get("active") === "on";
  if (!Number.isInteger(defaultSyncDays) || defaultSyncDays < 1 || defaultSyncDays > 90) {
    return redirectWith(request, "invalid");
  }

  const service = createServiceClient();
  const { data: existing } = await service.from("api_credentials")
    .select("id,encrypted_payload,config_summary")
    .eq("company_id", profile.company_id)
    .eq("provider", "planetchat")
    .eq("environment", "production")
    .maybeSingle();
  let previousToken = "";
  if (existing?.encrypted_payload) {
    try {
      previousToken = decryptPlanetChatCredentials(profile.company_id, existing.encrypted_payload).token;
    } catch {
      previousToken = "";
    }
  }
  const token = tokenInput || previousToken;
  if (!token.startsWith("intg_") || token.length < 10) return redirectWith(request, "invalid_token");

  try {
    await testPlanetChatConnection({ companyId: profile.company_id, token, defaultSyncDays });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Falha ao testar a PlanetChat.";
    if (existing?.id) {
      await service.from("api_credentials").update({
        last_tested_at: new Date().toISOString(),
        last_test_status: message,
        updated_at: new Date().toISOString()
      }).eq("id", existing.id).eq("company_id", profile.company_id);
    }
    return redirectWith(request, message.includes("autenticacao ou permissao") ? "connection_forbidden" : "connection_error");
  }

  const { error } = await service.from("api_credentials").upsert({
    company_id: profile.company_id,
    provider: "planetchat",
    environment: "production",
    encrypted_payload: encryptPlanetChatCredentials({ token, defaultSyncDays }),
    active,
    config_summary: {
      ...(existing?.config_summary && typeof existing.config_summary === "object" ? existing.config_summary : {}),
      tokenEnding: token.slice(-4),
      defaultSyncDays
    },
    last_tested_at: new Date().toISOString(),
    last_test_status: "conectado",
    updated_at: new Date().toISOString()
  }, { onConflict: "company_id,provider,environment" });

  if (!error) await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "api_credential", action: "configure_planetchat", metadata: { active, defaultSyncDays } });

  return redirectWith(request, error ? "save_error" : active ? "saved" : "saved_inactive");
}
