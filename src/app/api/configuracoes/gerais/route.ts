import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { onlyDigits } from "@/lib/validations/br-documents";

const segments = new Set(["tecnologia", "otica", "generico"]);
const simpleNationalStatuses = new Set(["1", "2", "3"]);
const assessmentRegimes = new Set(["1", "2", "3"]);
const specialTaxRegimes = new Set(["0", "1", "2", "3", "4", "5", "6", "9"]);

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function readPercentage(formData: FormData, key: string) {
  const raw = readString(formData, key).replace(",", ".");
  return raw ? Number(raw) : Number.NaN;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id,role,active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.company_id) {
    return NextResponse.redirect(new URL("/configuracoes/gerais?status=profile_error", request.url), 303);
  }

  if (profile.role !== "master" || profile.active === false) {
    return NextResponse.redirect(new URL("/configuracoes/gerais?status=forbidden", request.url), 303);
  }

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

  if (!name || !segments.has(serviceSegment)) {
    return NextResponse.redirect(new URL("/configuracoes/gerais?status=invalid", request.url), 303);
  }

  if (
    !/^\d{7}$/.test(cityCode)
    || !simpleNationalStatuses.has(simpleNationalStatus)
    || !specialTaxRegimes.has(specialTaxRegime)
    || (simpleNationalStatus === "3" && !assessmentRegimes.has(simpleNationalAssessmentRegime))
    || [federalTotalTaxRate, stateTotalTaxRate, municipalTotalTaxRate]
      .some((rate) => !Number.isFinite(rate) || rate < 0 || rate >= 100)
  ) {
    return NextResponse.redirect(new URL("/configuracoes/gerais?status=fiscal_invalid", request.url), 303);
  }

  const service = createServiceClient();
  const { error } = await service
    .from("companies")
    .update({
      name,
      document: document || null,
      service_segment: serviceSegment,
      fiscal_settings: {
        cityCode,
        municipalRegistration,
        series,
        simpleNationalStatus,
        simpleNationalAssessmentRegime: simpleNationalStatus === "3" ? simpleNationalAssessmentRegime : "",
        federalTotalTaxRate: federalTotalTaxRate.toFixed(2),
        stateTotalTaxRate: stateTotalTaxRate.toFixed(2),
        municipalTotalTaxRate: municipalTotalTaxRate.toFixed(2),
        specialTaxRegime
      },
      updated_at: new Date().toISOString()
    })
    .eq("id", profile.company_id);

  return NextResponse.redirect(new URL(`/configuracoes/gerais?status=${error ? "error" : "saved"}`, request.url), 303);
}
