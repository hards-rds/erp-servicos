import { NextRequest, NextResponse } from "next/server";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";
import { createServiceClient } from "@/lib/supabase/server";
import { syncPlanetChat } from "@/server/services/planetchat-sync-service";
import { tenantHasFeature } from "@/server/services/saas-plan-service";

export const runtime = "nodejs";
export const maxDuration = 300;

function redirectWith(request: NextRequest, status: string, extra: Record<string, string | number> = {}) {
  const url = new URL("/operacao/chamados", request.url);
  url.searchParams.set("status", status);
  Object.entries(extra).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return NextResponse.redirect(url, 303);
}

function utcPeriod(from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  const start = new Date(`${from}T00:00:00.000-03:00`);
  const end = new Date(`${to}T23:59:59.999-03:00`);
  const days = (end.getTime() - start.getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days < 0 || days > 90) return null;
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const action = String(formData.get("action") || "sync");
  const access = await requireCompanyPermission({
    module: "operacao.chamados",
    action: action === "link" ? "editar" : "criar",
    segment: "tecnologia"
  });
  if (!access.ok) {
    if (access.reason === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
    if (access.reason === "segment") return redirectWith(request, "segment_error");
    return redirectWith(request, access.reason === "forbidden" ? "forbidden" : "profile_error");
  }
  const { profile, user } = access;

  if (action === "link") {
    const supportOrderId = String(formData.get("supportOrderId") || "");
    const clientId = String(formData.get("clientId") || "");
    const contractId = String(formData.get("contractId") || "");
    if (!supportOrderId || !clientId) return redirectWith(request, "link_invalid");
    const service = createServiceClient();
    const [{ data: client }, { data: contract }] = await Promise.all([
      service.from("clients").select("id").eq("id", clientId).eq("company_id", profile.company_id).maybeSingle(),
      contractId
        ? service.from("contracts").select("id,client_id").eq("id", contractId).eq("company_id", profile.company_id).maybeSingle()
        : Promise.resolve({ data: null })
    ]);
    if (!client || (contractId && (!contract || contract.client_id !== clientId))) return redirectWith(request, "link_invalid");
    const { error } = await service.from("support_orders").update({
      client_id: clientId,
      contract_id: contractId || null,
      match_status: "manual",
      updated_at: new Date().toISOString()
    }).eq("id", supportOrderId).eq("company_id", profile.company_id);
    if (error) return redirectWith(request, "link_error");
    await writeCompanyAudit({
      companyId: profile.company_id,
      actorId: profile.id,
      entity: "support_order",
      entityId: supportOrderId,
      action: "link_client",
      metadata: { clientId, contractId: contractId || null }
    });
    return redirectWith(request, "linked");
  }

  if (!(await tenantHasFeature(profile.tenant_id, "api_integrations"))) return redirectWith(request, "plan_feature");

  const today = new Date().toISOString().slice(0, 10);
  const from = String(formData.get("from") || today);
  const to = String(formData.get("to") || today);
  const period = utcPeriod(from, to);
  if (!period) return redirectWith(request, "period_invalid");
  try {
    const result = await syncPlanetChat({
      companyId: profile.company_id,
      requestedBy: user.id,
      periodStart: period.start,
      periodEnd: period.end
    });
    await writeCompanyAudit({
      companyId: profile.company_id,
      actorId: profile.id,
      entity: "planetchat_sync",
      action: "sync",
      metadata: {
        periodStart: period.start,
        periodEnd: period.end,
        supportOrders: result.supportOrders,
        events: result.events,
        messages: result.messages
      }
    });
    return redirectWith(request, result.warning ? "sync_partial" : "synced", {
      imported: result.supportOrders,
      events: result.events,
      messages: result.messages,
      matched: result.matchedClients
    });
  } catch (error) {
    console.error("PlanetChat sync failed", {
      companyId: profile.company_id,
      message: error instanceof Error ? error.message : "unknown"
    });
    return redirectWith(request, "sync_error");
  }
}
