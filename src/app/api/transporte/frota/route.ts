import { NextRequest, NextResponse } from "next/server";
import { isValidBrazilianPlate, isValidState, normalizePlate, onlyDigits, parseTransportNumber } from "@/domains/transport/validation";
import { writeCompanyAudit } from "@/lib/auth/api-access";
import { getTransportContext, transportRedirectStatus } from "@/lib/transport/server";

function value(data: FormData, key: string) { return String(data.get(key) || "").trim(); }
function optionalNumber(data: FormData, key: string) { const raw = value(data, key); return raw ? parseTransportNumber(raw) : null; }
function redirectWith(request: NextRequest, status: string) { return NextResponse.redirect(new URL(`/transporte/frota?status=${status}`, request.url), 303); }

export async function POST(request: NextRequest) {
  const data = await request.formData();
  const action = value(data, "action") || "create";
  const access = await getTransportContext("frota", action === "delete" ? "excluir" : action === "update" ? "editar" : "criar");
  if (!access.ok) return access.reason === "unauthorized" ? NextResponse.redirect(new URL("/login", request.url), 303) : redirectWith(request, transportRedirectStatus(access.reason));
  const { supabase, profile } = access;
  const vehicleId = value(data, "vehicleId");

  if (action === "delete") {
    if (!vehicleId) return redirectWith(request, "invalid");
    const { data: deleted, error } = await supabase.from("transport_vehicles").delete().eq("company_id", profile.company_id).eq("id", vehicleId).select("id");
    if (error?.code === "23503") return redirectWith(request, "linked");
    if (error || !deleted?.length) return redirectWith(request, "error");
    await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "transport_vehicle", entityId: vehicleId, action: "delete" });
    return redirectWith(request, "deleted");
  }

  const plate = normalizePlate(value(data, "plate"));
  const registryState = value(data, "registryState").toUpperCase();
  const vehicleKind = value(data, "vehicleKind");
  const ownership = value(data, "ownership");
  const status = value(data, "status");
  const modelYear = optionalNumber(data, "modelYear");
  if (!isValidBrazilianPlate(plate) || !isValidState(registryState) || !["tracao", "reboque", "utilitario", "outro"].includes(vehicleKind) || !["proprio", "arrendado", "terceiro"].includes(ownership) || !["ativo", "manutencao", "inativo"].includes(status) || (modelYear !== null && (!Number.isInteger(modelYear) || modelYear < 1950 || modelYear > 2200))) return redirectWith(request, "invalid");

  const payload = {
    plate, renavam: onlyDigits(value(data, "renavam")) || null, registry_state: registryState, vehicle_kind: vehicleKind,
    body_type: value(data, "bodyType") || null, make: value(data, "make") || null, model: value(data, "model") || null,
    model_year: modelYear, color: value(data, "color") || null, rntrc: onlyDigits(value(data, "rntrc")) || null,
    ownership, owner_name: value(data, "ownerName") || null, owner_document: onlyDigits(value(data, "ownerDocument")) || null,
    tare_kg: optionalNumber(data, "tareKg"), capacity_kg: optionalNumber(data, "capacityKg"), capacity_m3: optionalNumber(data, "capacityM3"), odometer_km: optionalNumber(data, "odometerKm"),
    licensing_expires_at: value(data, "licensingExpiresAt") || null, insurance_expires_at: value(data, "insuranceExpiresAt") || null,
    status, notes: value(data, "notes") || null, updated_by: profile.id, updated_at: new Date().toISOString()
  };
  if ([payload.tare_kg, payload.capacity_kg, payload.capacity_m3, payload.odometer_km].some((item) => item !== null && item < 0)) return redirectWith(request, "invalid");

  if (action === "update") {
    if (!vehicleId) return redirectWith(request, "invalid");
    const { data: updated, error } = await supabase.from("transport_vehicles").update(payload).eq("company_id", profile.company_id).eq("id", vehicleId).select("id");
    if (error?.code === "23505") return redirectWith(request, "duplicate");
    if (error || !updated?.length) return redirectWith(request, "error");
    await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "transport_vehicle", entityId: vehicleId, action: "update" });
    return redirectWith(request, "updated");
  }

  const { data: created, error } = await supabase.from("transport_vehicles").insert({ company_id: profile.company_id, ...payload, created_by: profile.id }).select("id").single();
  if (error?.code === "23505") return redirectWith(request, "duplicate");
  if (error || !created) return redirectWith(request, "error");
  await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "transport_vehicle", entityId: created.id, action: "create" });
  return redirectWith(request, "created");
}
