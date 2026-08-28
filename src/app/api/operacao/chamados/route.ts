import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { syncPlanetChat } from "@/server/services/planetchat-sync-service";

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
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);
  const { data: profile } = await supabase.from("profiles")
    .select("company_id,active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.company_id || profile.active === false) return redirectWith(request, "profile_error");
  const { data: company } = await supabase.from("companies")
    .select("service_segment")
    .eq("id", profile.company_id)
    .maybeSingle();
  if (company?.service_segment !== "tecnologia") return redirectWith(request, "segment_error");

  const formData = await request.formData();
  const action = String(formData.get("action") || "sync");
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
    return redirectWith(request, error ? "link_error" : "linked");
  }

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
