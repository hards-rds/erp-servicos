import { NextRequest, NextResponse } from "next/server";
import { buildPilotChecklist, canApprovePilot, type PilotCheckStatus, type PilotSegment } from "@/domains/pilot/checklist";
import { writeCompanyAudit } from "@/lib/auth/api-access";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { countPilotBlockers, getTenantPilotReadiness } from "@/server/services/pilot-readiness-service";

export const runtime = "nodejs";

function value(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function redirectWith(request: NextRequest, tenantId: string | null, status: string) {
  const path = tenantId ? `/admin/pilotos/${tenantId}?status=${status}` : `/admin/pilotos?status=${status}`;
  return NextResponse.redirect(new URL(path, request.url), 303);
}

async function requireSystemAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("id,role,active").eq("id", user.id).maybeSingle();
  return profile?.role === "system_admin" && profile.active !== false ? { actorId: user.id } : null;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const tenantId = value(formData, "tenantId") || null;
  const access = await requireSystemAdmin();
  if (!access) return redirectWith(request, tenantId, "forbidden");
  if (!tenantId) return redirectWith(request, null, "invalid");

  const service = createServiceClient();
  const { data: tenant } = await service.from("tenants").select("id,companies(id,service_segment)").eq("id", tenantId).maybeSingle();
  if (!tenant) return redirectWith(request, tenantId, "not_found");
  const companyId = tenant.companies?.[0]?.id || null;
  const action = value(formData, "action");

  if (action === "start" || action === "refresh") {
    const targetEndAt = value(formData, "targetEndAt") || null;
    if (targetEndAt && !/^\d{4}-\d{2}-\d{2}$/.test(targetEndAt)) return redirectWith(request, tenantId, "invalid");
    const now = new Date().toISOString();
    const pilotResult = action === "start"
      ? await service.from("tenant_pilots").upsert({
        tenant_id: tenantId,
        status: "running",
        started_at: now,
        target_end_at: targetEndAt,
        coordinator_id: access.actorId,
        notes: value(formData, "notes") || null,
        updated_at: now
      }, { onConflict: "tenant_id" }).select("id").single()
      : await service.from("tenant_pilots").update({ updated_at: now }).eq("tenant_id", tenantId).select("id").maybeSingle();
    const { data: pilot, error } = pilotResult;
    if (error || !pilot) return redirectWith(request, tenantId, "error");

    const validSegments = new Set<PilotSegment>(["tecnologia", "otica", "escola_futebol", "generico"]);
    const segments = (tenant.companies || [])
      .map((company) => company.service_segment as PilotSegment)
      .filter((segment) => validSegments.has(segment));
    const checks = buildPilotChecklist(segments).map((check) => ({
      pilot_id: pilot.id,
      check_key: check.key,
      category: check.category,
      title: check.title,
      description: check.description,
      required: check.required
    }));
    const { error: checksError } = await service.from("tenant_pilot_checks").upsert(checks, { onConflict: "pilot_id,check_key", ignoreDuplicates: true });
    if (!checksError && companyId) await writeCompanyAudit({ companyId, actorId: access.actorId, entity: "tenant_pilot", entityId: pilot.id, action, metadata: { checks: checks.length } });
    return redirectWith(request, tenantId, checksError ? "error" : action === "start" ? "started" : "refreshed");
  }

  const { data: pilot } = await service.from("tenant_pilots").select("id,status").eq("tenant_id", tenantId).maybeSingle();
  if (!pilot) return redirectWith(request, tenantId, "not_started");

  if (action === "update_check") {
    const checkId = value(formData, "checkId");
    const checkStatus = value(formData, "checkStatus") as PilotCheckStatus;
    if (!checkId || !["pending", "passed", "failed", "not_applicable"].includes(checkStatus)) return redirectWith(request, tenantId, "invalid");
    const { data: currentCheck } = await service.from("tenant_pilot_checks").select("id,required").eq("id", checkId).eq("pilot_id", pilot.id).maybeSingle();
    if (!currentCheck || (currentCheck.required && checkStatus === "not_applicable")) return redirectWith(request, tenantId, "invalid");
    const checked = checkStatus === "pending" ? { checked_by: null, checked_at: null } : { checked_by: access.actorId, checked_at: new Date().toISOString() };
    const { error } = await service.from("tenant_pilot_checks").update({
      status: checkStatus,
      evidence: value(formData, "evidence") || null,
      notes: value(formData, "notes") || null,
      ...checked,
      updated_at: new Date().toISOString()
    }).eq("id", checkId).eq("pilot_id", pilot.id);
    if (!error && companyId) await writeCompanyAudit({ companyId, actorId: access.actorId, entity: "tenant_pilot_check", entityId: checkId, action: checkStatus });
    return redirectWith(request, tenantId, error ? "error" : "check_saved");
  }

  if (action === "set_status") {
    const nextStatus = value(formData, "pilotStatus");
    if (!["running", "blocked", "approved", "cancelled"].includes(nextStatus)) return redirectWith(request, tenantId, "invalid");
    if (nextStatus === "approved") {
      const [{ data: checks }, readiness] = await Promise.all([
        service.from("tenant_pilot_checks").select("check_key,required,status").eq("pilot_id", pilot.id),
        getTenantPilotReadiness(tenantId)
      ]);
      if (!canApprovePilot((checks || []).map((check) => ({ key: check.check_key, required: check.required, status: check.status as PilotCheckStatus })), countPilotBlockers(readiness))) {
        return redirectWith(request, tenantId, "approval_blocked");
      }
    }
    const { error } = await service.from("tenant_pilots").update({
      status: nextStatus,
      notes: value(formData, "pilotNotes") || null,
      approved_at: nextStatus === "approved" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    }).eq("id", pilot.id).eq("tenant_id", tenantId);
    if (!error && companyId) await writeCompanyAudit({ companyId, actorId: access.actorId, entity: "tenant_pilot", entityId: pilot.id, action: nextStatus });
    return redirectWith(request, tenantId, error ? "error" : "status_saved");
  }

  return redirectWith(request, tenantId, "invalid");
}
