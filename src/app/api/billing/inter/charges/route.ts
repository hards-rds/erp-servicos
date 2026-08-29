import { NextRequest, NextResponse } from "next/server";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";
import { cancelStoredInterCharge, processInterCharge } from "@/server/services/inter-charge-service";
import { tenantHasFeature } from "@/server/services/saas-plan-service";

export const runtime = "nodejs";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/financeiro/boletos-cobrancas?status=${status}`, request.url), 303);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const action = readString(formData, "action");
  const permissionAction = action === "create" ? "criar" : action === "cancel" ? "cancelar" : "emitir";
  const access = await requireCompanyPermission({ module: "financeiro.cobrancas", action: permissionAction });
  if (!access.ok) {
    if (access.reason === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
    return redirectWith(request, access.reason === "forbidden" ? "forbidden" : "profile_error");
  }
  const { supabase, profile } = access;
  if (["create", "process"].includes(action) && !(await tenantHasFeature(profile.tenant_id, "api_integrations"))) {
    return redirectWith(request, "plan_feature");
  }
  let chargeId = readString(formData, "chargeId");

  if (action === "create") {
    const entryId = readString(formData, "entryId");
    const { data: entry } = await supabase
      .from("financial_entries")
      .select("id,due_date,status")
      .eq("id", entryId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (!entry || ["cancelado", "recebido", "conciliado"].includes(entry.status)) return redirectWith(request, "invalid");

    const idempotencyKey = `inter-charge:${entry.id}:${entry.due_date}`;
    const { data: charge, error } = await supabase.from("boleto_charges").upsert({
      company_id: profile.company_id,
      financial_entry_id: entry.id,
      status: "rascunho",
      idempotency_key: idempotencyKey,
      updated_at: new Date().toISOString()
    }, { onConflict: "company_id,idempotency_key" }).select("id").single();
    if (error || !charge?.id) return redirectWith(request, "create_error");
    chargeId = charge.id;
  }

  if (!chargeId || !["create", "process", "sync", "cancel"].includes(action)) return redirectWith(request, "invalid");
  const { data: charge } = await supabase
    .from("boleto_charges")
    .select("id,status")
    .eq("id", chargeId)
    .eq("company_id", profile.company_id)
    .maybeSingle();
  if (!charge) return redirectWith(request, "invalid");

  if (action === "cancel") {
    const reason = readString(formData, "reason");
    if (reason.length < 5) return redirectWith(request, "cancel_invalid");
    try {
      await cancelStoredInterCharge(profile.company_id, charge.id, reason, profile.id);
      await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "boleto_charge", entityId: charge.id, action: "cancel", reason });
      return redirectWith(request, "cancelled");
    } catch {
      return redirectWith(request, "cancel_error");
    }
  }

  const result = await processInterCharge(profile.company_id, charge.id, profile.id);
  if (result.ok) await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "boleto_charge", entityId: charge.id, action, metadata: { status: result.status } });
  return redirectWith(request, result.ok ? (action === "sync" ? "synced" : "issued") : "inter_error");
}
