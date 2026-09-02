import { NextRequest, NextResponse } from "next/server";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";
import { createServiceClient } from "@/lib/supabase/server";
import { onlyDigits } from "@/lib/validations/br-documents";

const segments = new Set(["tecnologia", "otica", "escola_futebol", "transportadora", "generico"]);
const simpleNationalStatuses = new Set(["1", "2", "3"]);
const assessmentRegimes = new Set(["1", "2", "3"]);
const specialTaxRegimes = new Set(["0", "1", "2", "3", "4", "5", "6", "9"]);
const taxRegimeCodes = new Set(["1", "2", "3", "4"]);

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function readPercentage(formData: FormData, key: string) {
  const raw = readString(formData, key).replace(",", ".");
  return raw ? Number(raw) : Number.NaN;
}

export async function POST(request: NextRequest) {
  const access = await requireCompanyPermission({ module: "configuracoes.gerais", action: "configurar", roles: ["master", "system_admin"] });
  if (!access.ok) {
    if (access.reason === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
    return NextResponse.redirect(new URL(`/configuracoes/gerais?status=${access.reason === "forbidden" ? "forbidden" : "profile_error"}`, request.url), 303);
  }
  const { profile } = access;

  const formData = await request.formData();
  const name = readString(formData, "name");
  const document = onlyDigits(readString(formData, "document"));
  const serviceSegment = readString(formData, "serviceSegment");
  const cityCode = onlyDigits(readString(formData, "fiscalCityCode"));
  const municipalRegistration = onlyDigits(readString(formData, "municipalRegistration"));
  const series = readString(formData, "dpsSeries") || "1";
  const simpleNationalStatus = readString(formData, "simpleNationalStatus");
  const simpleNationalAssessmentRegime = readString(formData, "simpleNationalAssessmentRegime");
  const federalTotalTaxRate = readPercentage(formData, "federalTotalTaxRate");
  const stateTotalTaxRate = readPercentage(formData, "stateTotalTaxRate");
  const municipalTotalTaxRate = readPercentage(formData, "municipalTotalTaxRate");
  const specialTaxRegime = readString(formData, "specialTaxRegime") || "0";
  const taxRegimeCode = readString(formData, "taxRegimeCode");
  const ibsStateRate = readPercentage(formData, "ibsStateRate");
  const ibsMunicipalRate = readPercentage(formData, "ibsMunicipalRate");
  const cbsRate = readPercentage(formData, "cbsRate");

  if (!name || !segments.has(serviceSegment)) {
    return NextResponse.redirect(new URL("/configuracoes/gerais?status=invalid", request.url), 303);
  }

  if (
    !/^\d{7}$/.test(cityCode)
    || !simpleNationalStatuses.has(simpleNationalStatus)
    || !specialTaxRegimes.has(specialTaxRegime)
    || !taxRegimeCodes.has(taxRegimeCode)
    || (simpleNationalStatus === "3" && !assessmentRegimes.has(simpleNationalAssessmentRegime))
    || [federalTotalTaxRate, stateTotalTaxRate, municipalTotalTaxRate, ibsStateRate, ibsMunicipalRate, cbsRate]
      .some((rate) => !Number.isFinite(rate) || rate < 0 || rate >= 100)
  ) {
    return NextResponse.redirect(new URL("/configuracoes/gerais?status=fiscal_invalid", request.url), 303);
  }

  const service = createServiceClient();
  const { data: existingCompany } = await service
    .from("companies")
    .select("fiscal_settings")
    .eq("id", profile.company_id)
    .maybeSingle();
  const existingFiscalSettings = existingCompany?.fiscal_settings && typeof existingCompany.fiscal_settings === "object"
    ? existingCompany.fiscal_settings as Record<string, unknown>
    : {};
  const { error } = await service
    .from("companies")
    .update({
      name,
      document: document || null,
      service_segment: serviceSegment,
      fiscal_settings: {
        ...existingFiscalSettings,
        cityCode,
        municipalRegistration,
        series,
        simpleNationalStatus,
        simpleNationalAssessmentRegime: simpleNationalStatus === "3" ? simpleNationalAssessmentRegime : "",
        federalTotalTaxRate: federalTotalTaxRate.toFixed(2),
        stateTotalTaxRate: stateTotalTaxRate.toFixed(2),
        municipalTotalTaxRate: municipalTotalTaxRate.toFixed(2),
        specialTaxRegime,
        taxRegimeCode,
        ibsStateRate: ibsStateRate.toFixed(2),
        ibsMunicipalRate: ibsMunicipalRate.toFixed(2),
        cbsRate: cbsRate.toFixed(2)
      },
      updated_at: new Date().toISOString()
    })
    .eq("id", profile.company_id);

  if (!error) await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "company", entityId: profile.company_id, action: "configure", metadata: { serviceSegment, cityCode } });

  return NextResponse.redirect(new URL(`/configuracoes/gerais?status=${error ? "error" : "saved"}`, request.url), 303);
}
