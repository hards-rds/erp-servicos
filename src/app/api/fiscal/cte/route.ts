import { NextRequest, NextResponse } from "next/server";
import { cteValidationErrors, isValidState, onlyDigits, parseTransportNumber } from "@/domains/transport/validation";
import { writeCompanyAudit } from "@/lib/auth/api-access";
import { getTransportContext, transportRedirectStatus } from "@/lib/transport/server";
import { calculateCteIbsCbs, inferTaxRegimeCode, isIbsCbsRequired, validateCteIbsCbs } from "@/domains/fiscal/ibs-cbs";

type Relation<T> = T | T[] | null;
function first<T>(relation: Relation<T>) { return Array.isArray(relation) ? relation[0] : relation; }
function value(data: FormData, key: string) { return String(data.get(key) || "").trim(); }
function num(data: FormData, key: string, fallback = 0) { const raw = value(data, key); return raw ? parseTransportNumber(raw) : fallback; }
function listRedirect(request: NextRequest, status: string) { return NextResponse.redirect(new URL(`/fiscal/emissao-cte?status=${encodeURIComponent(status)}`, request.url), 303); }
function editRedirect(request: NextRequest, id: string, status: string) { return NextResponse.redirect(new URL(`/fiscal/emissao-cte/${id}/editar?status=${encodeURIComponent(status)}`, request.url), 303); }

export async function POST(request: NextRequest) {
  const data = await request.formData(); const action = value(data, "action");
  const permission = action === "delete" ? "excluir" : action === "prepare" ? "criar" : "editar";
  const access = await getTransportContext("cte", permission);
  if (!access.ok) return access.reason === "unauthorized" ? NextResponse.redirect(new URL("/login", request.url), 303) : listRedirect(request, transportRedirectStatus(access.reason));
  const { supabase, profile } = access;

  if (action === "prepare") {
    const tripId = value(data, "tripId");
    const { data: existing } = await supabase.from("cte_documents").select("id").eq("company_id", profile.company_id).eq("trip_id", tripId).neq("status", "cancelado").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing) return NextResponse.redirect(new URL(`/fiscal/emissao-cte/${existing.id}/editar`, request.url), 303);
    const [{ data: trip }, { data: company }] = await Promise.all([
      supabase.from("transport_trips").select("id,client_id,sender_client_id,recipient_client_id,freight_value,origin_state,cargo_description,cargo_type,gross_weight_kg,cargo_value,payer:clients!transport_trips_client_fk(legal_name,trade_name,document,address),sender:clients!transport_trips_sender_fk(legal_name,trade_name,document,address),recipient:clients!transport_trips_recipient_fk(legal_name,trade_name,document,address),transport_vehicles!transport_trips_vehicle_fk(plate,renavam,rntrc),transport_drivers!transport_trips_driver_fk(full_name,document,cnh_number)").eq("company_id", profile.company_id).eq("id", tripId).maybeSingle(),
      supabase.from("companies").select("fiscal_settings").eq("id", profile.company_id).maybeSingle()
    ]);
    if (!trip || !trip.client_id || !trip.sender_client_id || !trip.recipient_client_id) return listRedirect(request, "trip_incomplete");
    const payer = first(trip.payer); const sender = first(trip.sender); const recipient = first(trip.recipient); const vehicle = first(trip.transport_vehicles); const driver = first(trip.transport_drivers);
    const settings = company?.fiscal_settings && typeof company.fiscal_settings === "object" ? company.fiscal_settings as Record<string, unknown> : {};
    const initialIbsCbs = calculateCteIbsCbs({ baseAmount: Number(trip.freight_value), ibsStateRate: Number(settings.ibsStateRate ?? 0.1), ibsMunicipalRate: Number(settings.ibsMunicipalRate ?? 0), cbsRate: Number(settings.cbsRate ?? 0.9) });
    const { data: created, error } = await supabase.from("cte_documents").insert({ company_id: profile.company_id, trip_id: trip.id, client_id: trip.client_id, operation_nature: "Prestacao de servico de transporte", cfop: "", issue_state: trip.origin_state, freight_value: trip.freight_value, amount_receivable: trip.freight_value, sender_data: sender || {}, recipient_data: recipient || {}, payer_data: payer || {}, cargo_data: { description: trip.cargo_description, type: trip.cargo_type, grossWeightKg: trip.gross_weight_kg, value: trip.cargo_value, vehicle, driver }, tax_data: { taxRegimeCode: inferTaxRegimeCode(settings), ibsCbs: initialIbsCbs }, created_by: profile.id, updated_by: profile.id }).select("id").single();
    if (error || !created) return listRedirect(request, "error");
    await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "cte_document", entityId: created.id, action: "prepare", metadata: { tripId } });
    return NextResponse.redirect(new URL(`/fiscal/emissao-cte/${created.id}/editar?status=prepared`, request.url), 303);
  }

  const cteId = value(data, "cteId"); if (!cteId) return listRedirect(request, "invalid");
  if (action === "delete") {
    const { data: deleted, error } = await supabase.from("cte_documents").delete().eq("company_id", profile.company_id).eq("id", cteId).in("status", ["rascunho", "validado", "rejeitado"]).select("id");
    if (error || !deleted?.length) return listRedirect(request, "locked");
    await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "cte_document", entityId: cteId, action: "delete" }); return listRedirect(request, "deleted");
  }

  if (!["update", "validate"].includes(action)) return listRedirect(request, "invalid");
  const environment = value(data, "environment"); const serviceType = value(data, "serviceType"); const issueState = value(data, "issueState").toUpperCase(); const cfop = onlyDigits(value(data, "cfop"));
  const series = Number(value(data, "series")); const freightValue = num(data, "freightValue", -1); const amountReceivable = num(data, "amountReceivable", -1);
  if (!["homologacao", "producao"].includes(environment) || !["normal", "subcontratacao", "redespacho", "redespacho_intermediario", "multimodal"].includes(serviceType) || !isValidState(issueState) || !Number.isInteger(series) || series < 1 || series > 999 || freightValue === null || freightValue < 0 || amountReceivable === null || amountReceivable < 0) return editRedirect(request, cteId, "invalid");
  const ibsCbs = calculateCteIbsCbs({
    ibsCbsCst: value(data, "ibsCbsCst"),
    ibsCbsTaxClass: value(data, "ibsCbsTaxClass"),
    baseAmount: num(data, "ibsCbsBaseAmount", 0) || 0,
    ibsStateRate: num(data, "ibsStateRate", 0) || 0,
    ibsStateReductionRate: num(data, "ibsStateReductionRate", 0) || 0,
    ibsMunicipalRate: num(data, "ibsMunicipalRate", 0) || 0,
    ibsMunicipalReductionRate: num(data, "ibsMunicipalReductionRate", 0) || 0,
    cbsRate: num(data, "cbsRate", 0) || 0,
    cbsReductionRate: num(data, "cbsReductionRate", 0) || 0
  });
  const { data: taxCompany } = await supabase.from("companies").select("fiscal_settings").eq("id", profile.company_id).maybeSingle();
  const taxCompanySettings = taxCompany?.fiscal_settings && typeof taxCompany.fiscal_settings === "object" ? taxCompany.fiscal_settings as Record<string, unknown> : {};
  const taxData = { cst: value(data, "taxCst") || null, baseAmount: num(data, "taxBaseAmount", 0), rate: num(data, "taxRate", 0), amount: num(data, "taxAmount", 0), taxRegimeCode: inferTaxRegimeCode(taxCompanySettings), ibsCbs };
  const payload = { environment, series, service_type: serviceType, operation_nature: value(data, "operationNature"), cfop, issue_state: issueState, freight_value: freightValue, amount_receivable: amountReceivable, tax_data: taxData, updated_by: profile.id, updated_at: new Date().toISOString() };
  const { error: updateError } = await supabase.from("cte_documents").update({ ...payload, status: "rascunho", rejection_message: null }).eq("company_id", profile.company_id).eq("id", cteId).in("status", ["rascunho", "validado", "rejeitado"]);
  if (updateError) return editRedirect(request, cteId, "error");
  if (action === "update") return editRedirect(request, cteId, "updated");

  const [{ data: document }, { data: company }] = await Promise.all([
    supabase.from("cte_documents").select("id,environment,cfop,operation_nature,issue_state,freight_value,client_id,tax_data,transport_trips!cte_documents_trip_fk(origin_city_code,destination_city_code,transport_vehicles!transport_trips_vehicle_fk(plate),transport_drivers!transport_trips_driver_fk(document)),clients!cte_documents_client_fk(document)").eq("company_id", profile.company_id).eq("id", cteId).maybeSingle(),
    supabase.from("companies").select("fiscal_settings").eq("id", profile.company_id).maybeSingle()
  ]);
  if (!document) return editRedirect(request, cteId, "error");
  const trip = first(document.transport_trips); const vehicle = first(trip?.transport_vehicles || null); const driver = first(trip?.transport_drivers || null); const client = first(document.clients);
  const errors = cteValidationErrors({ cfop: document.cfop, operationNature: document.operation_nature, issueState: document.issue_state, originCityCode: trip?.origin_city_code || "", destinationCityCode: trip?.destination_city_code || "", vehiclePlate: vehicle?.plate || "", driverDocument: driver?.document || "", clientDocument: client?.document, freightValue: Number(document.freight_value) });
  const settings = company?.fiscal_settings && typeof company.fiscal_settings === "object" ? company.fiscal_settings as Record<string, unknown> : {};
  const storedTax = document.tax_data && typeof document.tax_data === "object" ? document.tax_data as Record<string, unknown> : {};
  const required = isIbsCbsRequired({ documentKind: "cte", environment: document.environment, taxRegimeCode: String(storedTax.taxRegimeCode || inferTaxRegimeCode(settings)) });
  const storedIbsCbs = storedTax.ibsCbs && typeof storedTax.ibsCbs === "object" ? storedTax.ibsCbs as Record<string, unknown> : {};
  if (required && !String(storedTax.taxRegimeCode || inferTaxRegimeCode(settings))) errors.push("Codigo do regime tributario (CRT) obrigatorio em Configuracoes Gerais.");
  errors.push(...validateCteIbsCbs(storedIbsCbs, required));
  const { error: validationUpdateError } = await supabase.from("cte_documents").update({ status: errors.length ? "rascunho" : "validado", rejection_message: errors.length ? errors.join(" ") : null, updated_by: profile.id, updated_at: new Date().toISOString() }).eq("company_id", profile.company_id).eq("id", cteId);
  if (validationUpdateError) return editRedirect(request, cteId, "error");
  await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "cte_document", entityId: cteId, action: "validate", metadata: { valid: errors.length === 0, errors } });
  return editRedirect(request, cteId, errors.length ? `validation:${errors.join("|")}` : "validated");
}
