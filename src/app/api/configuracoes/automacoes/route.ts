import { NextRequest, NextResponse } from "next/server";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";
import { runRecurringAutomation } from "@/server/services/recurrence-automation-service";
import { tenantHasFeature } from "@/server/services/saas-plan-service";

export async function POST(request: NextRequest) {
  const access = await requireCompanyPermission({ module: "configuracoes.gerais", action: "configurar" });
  if (!access.ok) {
    if (access.reason === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
    return NextResponse.redirect(new URL("/configuracoes/automacoes?status=forbidden", request.url), 303);
  }
  if (!(await tenantHasFeature(access.profile.tenant_id, "recurring_automation"))) {
    return NextResponse.redirect(new URL("/configuracoes/automacoes?status=plan_feature", request.url), 303);
  }

  try {
    const summary = await runRecurringAutomation({ companyId: access.profile.company_id });
    await writeCompanyAudit({
      companyId: access.profile.company_id,
      actorId: access.profile.id,
      entity: "recurrence_automation",
      action: "run_manual",
      metadata: summary
    });
    const target = new URL("/configuracoes/automacoes", request.url);
    target.searchParams.set("status", "processed");
    target.searchParams.set("processed", String(summary.processed));
    target.searchParams.set("partial", String(summary.partial));
    target.searchParams.set("failed", String(summary.failed));
    target.searchParams.set("alerts", String(summary.alerts));
    return NextResponse.redirect(target, 303);
  } catch {
    return NextResponse.redirect(new URL("/configuracoes/automacoes?status=error", request.url), 303);
  }
}
