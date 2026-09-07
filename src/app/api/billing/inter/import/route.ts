import { NextRequest, NextResponse } from "next/server";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";
import { importStoredInterCharge } from "@/server/services/inter-charge-service";
import { tenantHasFeature } from "@/server/services/saas-plan-service";

export const runtime = "nodejs";

function value(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function redirect(request: NextRequest, status: string, competence: string) {
  const target = new URL("/financeiro/boletos-cobrancas", request.url);
  target.searchParams.set("status", status);
  target.searchParams.set("inter", "1");
  if (/^\d{4}-\d{2}$/.test(competence)) target.searchParams.set("competence", competence);
  return NextResponse.redirect(target, 303);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const competence = value(formData, "competence");
  const entryId = value(formData, "entryId");
  const externalId = value(formData, "externalId");
  const access = await requireCompanyPermission({ module: "financeiro.cobrancas", action: "criar" });
  if (!access.ok) {
    if (access.reason === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
    return redirect(request, access.reason === "forbidden" ? "forbidden" : "profile_error", competence);
  }
  if (!(await tenantHasFeature(access.profile.tenant_id, "api_integrations"))) {
    return redirect(request, "plan_feature", competence);
  }
  if (!entryId || !externalId) return redirect(request, "import_invalid", competence);

  try {
    const result = await importStoredInterCharge({
      companyId: access.profile.company_id,
      entryId,
      externalId,
      actorId: access.profile.id
    });
    await writeCompanyAudit({
      companyId: access.profile.company_id,
      actorId: access.profile.id,
      entity: "boleto_charge",
      entityId: result.chargeId,
      action: "import_inter_charge",
      metadata: { externalId, entryId, status: result.status }
    });
    return redirect(request, "imported", competence);
  } catch (error) {
    console.error("inter_charge_import_failed", {
      companyId: access.profile.company_id,
      message: error instanceof Error ? error.message : "unknown"
    });
    return redirect(request, "import_error", competence);
  }
}
