import { NextRequest, NextResponse } from "next/server";
import { serviceTypeOptions, type ServiceSegment } from "@/domains/services/catalog";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";
import { isPlanLimitError } from "@/domains/billing/saas-plans";
import { canCreateTenantResource } from "@/server/services/saas-plan-service";
import { collectIbsCbsServiceData, validateIbsCbsServiceData } from "@/domains/fiscal/ibs-cbs";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function parseMoney(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/cadastros/servicos?view=catalogo&status=${status}`, request.url), 303);
}

function collectFiscalServiceData(formData: FormData) {
  return {
    provider: "nfse_nacional",
    serviceCode: readString(formData, "serviceCode"),
    municipalServiceCode: readString(formData, "municipalServiceCode"),
    nbsCode: readString(formData, "nbsCode"),
    retainIss: formData.get("retainIss") === "on",
    ...collectIbsCbsServiceData(formData)
  };
}

function hasValidFiscalCodes(fiscalData: ReturnType<typeof collectFiscalServiceData>) {
  if (fiscalData.serviceCode && !/^\d{6}$/.test(fiscalData.serviceCode)) return false;
  if (fiscalData.nbsCode && !/^\d{9}$/.test(fiscalData.nbsCode)) return false;
  return validateIbsCbsServiceData(fiscalData, false).length === 0;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const action = readString(formData, "action");
  const access = await requireCompanyPermission({
    module: "cadastros.servicos",
    action: action === "create" ? "criar" : "editar"
  });
  if (!access.ok) {
    if (access.reason === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
    return redirectWith(request, access.reason === "forbidden" ? "forbidden" : "profile_error");
  }
  const { supabase, profile } = access;

  if (action === "toggle") {
    const catalogServiceId = readString(formData, "catalogServiceId");
    const active = readString(formData, "active") === "true";
    if (!catalogServiceId) return redirectWith(request, "catalog_invalid");
    const { error } = await supabase
      .from("service_catalog")
      .update({ active, updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("id", catalogServiceId)
      .eq("company_id", profile.company_id);
    if (!error) await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "service_catalog", entityId: catalogServiceId, action: "toggle", metadata: { active } });
    return redirectWith(request, error ? "catalog_error" : "catalog_updated");
  }

  if (!["create", "update"].includes(action)) return redirectWith(request, "catalog_invalid");

  const catalogServiceId = readString(formData, "catalogServiceId");
  const name = readString(formData, "name");
  const serviceType = readString(formData, "serviceType") || "avulso";
  const salePrice = parseMoney(readString(formData, "salePrice"));
  const fiscalServiceData = collectFiscalServiceData(formData);
  if ((action === "update" && !catalogServiceId) || !name || salePrice === null || salePrice < 0 || !hasValidFiscalCodes(fiscalServiceData)) {
    return redirectWith(request, "catalog_invalid");
  }

  const { data: company } = await supabase
    .from("companies")
    .select("service_segment")
    .eq("id", profile.company_id)
    .maybeSingle();
  const segment = (company?.service_segment || "tecnologia") as ServiceSegment;
  const allowedTypes = new Set((serviceTypeOptions[segment] || serviceTypeOptions.tecnologia).map((item) => item.value));
  if (!allowedTypes.has(serviceType)) return redirectWith(request, "catalog_invalid");

  const payload = {
    code: readString(formData, "code") || null,
    name,
    description: readString(formData, "description") || null,
    category: readString(formData, "category") || null,
    service_type: serviceType,
    sale_price: salePrice,
    fiscal_service_data: fiscalServiceData,
    notes: readString(formData, "notes") || null,
    updated_by: profile.id,
    updated_at: new Date().toISOString()
  };

  if (action === "update") {
    const { data: existing } = await supabase
      .from("service_catalog")
      .select("id")
      .eq("id", catalogServiceId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (!existing) return redirectWith(request, "catalog_invalid");

    const { error } = await supabase
      .from("service_catalog")
      .update(payload)
      .eq("id", catalogServiceId)
      .eq("company_id", profile.company_id);
    if (!error) await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "service_catalog", entityId: catalogServiceId, action: "update" });
    return redirectWith(request, error ? (error.code === "23505" ? "catalog_duplicate" : "catalog_error") : "catalog_updated");
  }

  const capacity = await canCreateTenantResource(profile.tenant_id, "catalog_items");
  if (!capacity.allowed) return redirectWith(request, "plan_limit");

  const { data: created, error } = await supabase.from("service_catalog").insert({
    ...payload,
    company_id: profile.company_id,
    active: true,
    created_by: profile.id
  }).select("id").single();
  if (!error && created) await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "service_catalog", entityId: created.id, action: "create" });
  return redirectWith(request, error ? (error.code === "23505" ? "catalog_duplicate" : isPlanLimitError(error) ? "plan_limit" : "catalog_error") : "catalog_created");
}
