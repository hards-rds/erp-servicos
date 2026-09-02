import { NextRequest, NextResponse } from "next/server";
import { isValidAccessKey, isValidCityCode, isValidState, onlyDigits, parseTransportNumber } from "@/domains/transport/validation";
import { writeCompanyAudit } from "@/lib/auth/api-access";
import { getTransportContext, transportRedirectStatus } from "@/lib/transport/server";

function value(data: FormData, key: string) { return String(data.get(key) || "").trim(); }
function number(data: FormData, key: string, fallback: number | null = null) { const raw = value(data, key); const parsed = raw ? parseTransportNumber(raw) : fallback; return parsed; }
function redirectWith(request: NextRequest, status: string) { return NextResponse.redirect(new URL(`/transporte/viagens?status=${status}`, request.url), 303); }

export async function POST(request: NextRequest) {
  const data = await request.formData(); const action = value(data, "action") || "create";
  const permission = action === "delete" ? "excluir" : action === "update" || action === "generate_financial" ? "editar" : "criar";
  const access = await getTransportContext("viagens", permission);
  if (!access.ok) return access.reason === "unauthorized" ? NextResponse.redirect(new URL("/login", request.url), 303) : redirectWith(request, transportRedirectStatus(access.reason));
  const { supabase, profile } = access; const tripId = value(data, "tripId");

  if (action === "delete") {
    if (!tripId) return redirectWith(request, "invalid");
    const { data: deleted, error } = await supabase.from("transport_trips").delete().eq("company_id", profile.company_id).eq("id", tripId).select("id");
    if (error?.code === "23503") return redirectWith(request, "linked"); if (error || !deleted?.length) return redirectWith(request, "error");
    await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "transport_trip", entityId: tripId, action: "delete" }); return redirectWith(request, "deleted");
  }

  if (action === "generate_financial") {
    const { data: trip } = await supabase.from("transport_trips").select("id,trip_number,client_id,cargo_description,freight_value,scheduled_departure_at,status").eq("company_id", profile.company_id).eq("id", tripId).maybeSingle();
    if (!trip || trip.status === "cancelada") return redirectWith(request, "invalid");
    const date = String(trip.scheduled_departure_at).slice(0, 10); const description = `Frete viagem ${trip.trip_number} - ${trip.cargo_description}`;
    const { error } = await supabase.from("financial_entries").upsert({ company_id: profile.company_id, client_id: trip.client_id, transport_trip_id: trip.id, type: "avulsa", description, competence: date.slice(0, 7), issued_at: date, due_date: date, gross_amount: trip.freight_value, discounts: 0, interest: 0, penalty: 0, net_amount: trip.freight_value, status: "previsto", idempotency_key: `transport-trip:${trip.id}:freight`, created_by: profile.id, updated_by: profile.id, updated_at: new Date().toISOString() }, { onConflict: "company_id,idempotency_key", ignoreDuplicates: true });
    if (error) return redirectWith(request, "financial_error");
    await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "transport_trip", entityId: trip.id, action: "generate_financial" }); return redirectWith(request, "financial_created");
  }

  const status = value(data, "status"); const vehicleId = value(data, "vehicleId"); const trailerId = value(data, "trailerId") || null; const driverId = value(data, "driverId");
  const clientId = value(data, "clientId") || null; const senderClientId = value(data, "senderClientId") || null; const recipientClientId = value(data, "recipientClientId") || null; const originState = value(data, "originState").toUpperCase(); const destinationState = value(data, "destinationState").toUpperCase();
  const originCityCode = onlyDigits(value(data, "originCityCode")); const destinationCityCode = onlyDigits(value(data, "destinationCityCode")); const accessKey = onlyDigits(value(data, "accessKey"));
  const freightValue = number(data, "freightValue"); const grossWeight = number(data, "grossWeightKg", 0); const cargoValue = number(data, "cargoValue", 0);
  const scheduledDeparture = value(data, "scheduledDepartureAt"); const scheduledArrival = value(data, "scheduledArrivalAt") || null;
  if (!vehicleId || !driverId || trailerId === vehicleId || !["planejada", "carregamento", "em_transito", "entregue", "cancelada"].includes(status) || !value(data, "cargoDescription") || !value(data, "originCity") || !value(data, "destinationCity") || !isValidState(originState) || !isValidState(destinationState) || !isValidCityCode(originCityCode) || !isValidCityCode(destinationCityCode) || !isValidAccessKey(accessKey) || freightValue === null || freightValue < 0 || grossWeight === null || grossWeight < 0 || cargoValue === null || cargoValue < 0 || !scheduledDeparture || (scheduledArrival && scheduledArrival < scheduledDeparture)) return redirectWith(request, "invalid");
  const ids = [vehicleId, trailerId].filter(Boolean) as string[]; const clientIds = Array.from(new Set([clientId, senderClientId, recipientClientId].filter(Boolean))) as string[];
  const [{ data: validVehicles }, { data: validDriver }, { data: validClients }] = await Promise.all([
    supabase.from("transport_vehicles").select("id,vehicle_kind").eq("company_id", profile.company_id).in("id", ids),
    supabase.from("transport_drivers").select("id").eq("company_id", profile.company_id).eq("id", driverId).neq("status", "inativo").maybeSingle(),
    clientIds.length ? supabase.from("clients").select("id").eq("company_id", profile.company_id).in("id", clientIds) : Promise.resolve({ data: [] })
  ]);
  if ((validVehicles || []).length !== ids.length || !validDriver || (validClients || []).length !== clientIds.length) return redirectWith(request, "invalid_relation");
  const payload = { client_id: clientId, sender_client_id: senderClientId, recipient_client_id: recipientClientId, vehicle_id: vehicleId, trailer_id: trailerId, driver_id: driverId, status, cargo_description: value(data, "cargoDescription"), cargo_type: value(data, "cargoType") || null, cargo_quantity: number(data, "cargoQuantity"), gross_weight_kg: grossWeight, cargo_value: cargoValue, freight_value: freightValue, toll_value: number(data, "tollValue", 0) || 0, insurance_value: number(data, "insuranceValue", 0) || 0, other_costs: number(data, "otherCosts", 0) || 0, origin_city: value(data, "originCity"), origin_state: originState, origin_city_code: originCityCode, destination_city: value(data, "destinationCity"), destination_state: destinationState, destination_city_code: destinationCityCode, scheduled_departure_at: scheduledDeparture, scheduled_arrival_at: scheduledArrival, distance_km: number(data, "distanceKm"), payer_role: value(data, "payerRole"), operational_notes: value(data, "operationalNotes") || null, updated_by: profile.id, updated_at: new Date().toISOString() };
  let savedId = tripId;
  if (action === "update") {
    const { data: updated, error } = await supabase.from("transport_trips").update(payload).eq("company_id", profile.company_id).eq("id", tripId).select("id").single(); if (error || !updated) return redirectWith(request, "error"); savedId = updated.id;
  } else {
    const { data: created, error } = await supabase.from("transport_trips").insert({ company_id: profile.company_id, ...payload, created_by: profile.id }).select("id").single(); if (error || !created) return redirectWith(request, "error"); savedId = created.id;
  }
  const { data: existingDoc } = await supabase.from("transport_trip_documents").select("id").eq("company_id", profile.company_id).eq("trip_id", savedId).eq("document_type", "nfe").limit(1).maybeSingle();
  if (accessKey) {
    const documentPayload = { access_key: accessKey, created_by: profile.id };
    const { error } = existingDoc ? await supabase.from("transport_trip_documents").update(documentPayload).eq("company_id", profile.company_id).eq("id", existingDoc.id) : await supabase.from("transport_trip_documents").insert({ company_id: profile.company_id, trip_id: savedId, document_type: "nfe", ...documentPayload });
    if (error) return redirectWith(request, error.code === "23505" ? "duplicate_document" : "document_error");
  } else if (existingDoc) await supabase.from("transport_trip_documents").delete().eq("company_id", profile.company_id).eq("id", existingDoc.id);
  await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "transport_trip", entityId: savedId, action: action === "update" ? "update" : "create" }); return redirectWith(request, action === "update" ? "updated" : "created");
}
