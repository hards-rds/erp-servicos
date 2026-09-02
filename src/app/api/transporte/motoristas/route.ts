import { NextRequest, NextResponse } from "next/server";
import { writeCompanyAudit } from "@/lib/auth/api-access";
import { getTransportContext, transportRedirectStatus } from "@/lib/transport/server";
import { isValidCpf, onlyDigits } from "@/lib/validations/br-documents";

function value(data: FormData, key: string) { return String(data.get(key) || "").trim(); }
function redirectWith(request: NextRequest, status: string) { return NextResponse.redirect(new URL(`/transporte/motoristas?status=${status}`, request.url), 303); }

export async function POST(request: NextRequest) {
  const data = await request.formData(); const action = value(data, "action") || "create";
  const access = await getTransportContext("motoristas", action === "delete" ? "excluir" : action === "update" ? "editar" : "criar");
  if (!access.ok) return access.reason === "unauthorized" ? NextResponse.redirect(new URL("/login", request.url), 303) : redirectWith(request, transportRedirectStatus(access.reason));
  const { supabase, profile } = access; const driverId = value(data, "driverId");
  if (action === "delete") {
    if (!driverId) return redirectWith(request, "invalid");
    const { data: deleted, error } = await supabase.from("transport_drivers").delete().eq("company_id", profile.company_id).eq("id", driverId).select("id");
    if (error?.code === "23503") return redirectWith(request, "linked");
    if (error || !deleted?.length) return redirectWith(request, "error");
    await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "transport_driver", entityId: driverId, action: "delete" });
    return redirectWith(request, "deleted");
  }
  const document = onlyDigits(value(data, "document")); const cnhNumber = onlyDigits(value(data, "cnhNumber"));
  const employmentType = value(data, "employmentType"); const status = value(data, "status");
  const fullName = value(data, "fullName"); const cnhCategory = value(data, "cnhCategory").toUpperCase(); const cnhExpiresAt = value(data, "cnhExpiresAt");
  if (!fullName || !isValidCpf(document) || cnhNumber.length !== 11 || !/^[A-E]{1,2}$/.test(cnhCategory) || !/^\d{4}-\d{2}-\d{2}$/.test(cnhExpiresAt) || !["proprio", "agregado", "terceiro"].includes(employmentType) || !["ativo", "afastado", "inativo"].includes(status)) return redirectWith(request, "invalid");
  const payload = { full_name: fullName, document, cnh_number: cnhNumber, cnh_category: cnhCategory, cnh_expires_at: cnhExpiresAt, phone: value(data, "phone") || null, email: value(data, "email").toLowerCase() || null, employment_type: employmentType, status, emergency_contact: value(data, "emergencyContact") || null, notes: value(data, "notes") || null, updated_by: profile.id, updated_at: new Date().toISOString() };
  if (action === "update") {
    const { data: updated, error } = await supabase.from("transport_drivers").update(payload).eq("company_id", profile.company_id).eq("id", driverId).select("id");
    if (error?.code === "23505") return redirectWith(request, "duplicate"); if (error || !updated?.length) return redirectWith(request, "error");
    await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "transport_driver", entityId: driverId, action: "update" }); return redirectWith(request, "updated");
  }
  const { data: created, error } = await supabase.from("transport_drivers").insert({ company_id: profile.company_id, ...payload, created_by: profile.id }).select("id").single();
  if (error?.code === "23505") return redirectWith(request, "duplicate"); if (error || !created) return redirectWith(request, "error");
  await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "transport_driver", entityId: created.id, action: "create" }); return redirectWith(request, "created");
}
