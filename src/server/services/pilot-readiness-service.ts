import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

export type PilotReadinessSignal = {
  key: string;
  title: string;
  detail: string;
  passed: boolean;
  blocking: boolean;
};

export async function getTenantPilotReadiness(tenantId: string): Promise<PilotReadinessSignal[]> {
  const service = createServiceClient();
  const [{ data: tenant, error: tenantError }, { data: companies, error: companyError }, membersResult, subscriptionResult] = await Promise.all([
    service.from("tenants").select("id,status").eq("id", tenantId).maybeSingle(),
    service.from("companies").select("id,active").eq("tenant_id", tenantId),
    service.from("tenant_members").select("user_id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("active", true),
    service.from("tenant_subscriptions").select("status").eq("tenant_id", tenantId).maybeSingle()
  ]);
  const activeCompanies = (companies || []).filter((company) => company.active);
  const companyIds = activeCompanies.map((company) => company.id);
  const recentCutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();

  let integrationFailures = 0;
  let integrationQueryFailed = false;
  if (companyIds.length) {
    const [nfse, charges, syncs] = await Promise.all([
      service.from("nfse_documents").select("id", { count: "exact", head: true }).in("company_id", companyIds).in("status", ["rejeitada", "erro_integracao"]).gte("updated_at", recentCutoff),
      service.from("boleto_charges").select("id", { count: "exact", head: true }).in("company_id", companyIds).eq("status", "erro_integracao").gte("updated_at", recentCutoff),
      service.from("planetchat_sync_runs").select("id", { count: "exact", head: true }).in("company_id", companyIds).in("status", ["erro", "parcial"]).gte("started_at", recentCutoff)
    ]);
    integrationQueryFailed = Boolean(nfse.error || charges.error || syncs.error);
    integrationFailures = (nfse.count || 0) + (charges.count || 0) + (syncs.count || 0);
  }

  const subscriptionStatus = subscriptionResult.data?.status || "nao configurada";
  return [
    { key: "tenant_active", title: "Tenant ativo", detail: tenantError ? "Falha ao consultar o tenant." : `Status atual: ${tenant?.status || "nao encontrado"}.`, passed: tenant?.status === "active" || tenant?.status === "trial", blocking: true },
    { key: "active_company", title: "Empresa ativa", detail: companyError ? "Falha ao consultar as empresas." : `${activeCompanies.length} empresa(s) ativa(s).`, passed: !companyError && activeCompanies.length > 0, blocking: true },
    { key: "active_users", title: "Usuarios ativos", detail: membersResult.error ? "Falha ao consultar os usuarios." : `${membersResult.count || 0} usuario(s) ativo(s).`, passed: !membersResult.error && (membersResult.count || 0) > 0, blocking: true },
    { key: "subscription", title: "Assinatura operacional", detail: subscriptionResult.error ? "Falha ao consultar a assinatura." : `Status atual: ${subscriptionStatus}.`, passed: !subscriptionResult.error && ["active", "trialing"].includes(subscriptionStatus), blocking: true },
    { key: "integrations", title: "Integracoes sem falhas recentes", detail: integrationQueryFailed ? "Falha ao consultar os incidentes." : `${integrationFailures} incidente(s) nos ultimos 7 dias.`, passed: !integrationQueryFailed && integrationFailures === 0, blocking: true }
  ];
}

export function countPilotBlockers(signals: PilotReadinessSignal[]) {
  return signals.filter((signal) => signal.blocking && !signal.passed).length;
}
