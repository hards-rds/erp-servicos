import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";

type CompanyRow = { id: string; name: string };
type Incident = {
  id: string;
  companyId: string;
  module: string;
  status: string;
  message: string;
  occurredAt: string;
};

function dateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

function certificateState(validUntil: string | null) {
  if (!validUntil) return "Validade nao informada";
  const expiry = new Date(`${validUntil}T23:59:59`);
  const remainingDays = Math.ceil((expiry.getTime() - Date.now()) / 86_400_000);
  if (remainingDays < 0) return "Expirado";
  if (remainingDays <= 30) return `Expira em ${remainingDays} dias`;
  return "Valido";
}

export default async function SystemHealthPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role,active").eq("id", user.id).maybeSingle()
    : { data: null };
  if (profile?.role !== "system_admin" || profile.active === false) notFound();

  const service = createServiceClient();
  const recentSyncCutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [
    tenantsResult,
    companiesCountResult,
    usersResult,
    companiesResult,
    nfseResult,
    chargesResult,
    syncRunsResult,
    credentialsResult,
    certificatesResult
  ] = await Promise.all([
    service.from("tenants").select("id", { count: "exact", head: true }),
    service.from("companies").select("id", { count: "exact", head: true }).eq("active", true),
    service.from("profiles").select("id", { count: "exact", head: true }).eq("active", true),
    service.from("companies").select("id,name"),
    service.from("nfse_documents")
      .select("id,company_id,status,rejection_message,created_at", { count: "exact" })
      .in("status", ["rejeitada", "erro_integracao"])
      .order("created_at", { ascending: false })
      .limit(20),
    service.from("boleto_charges")
      .select("id,company_id,status,rejection_message,updated_at", { count: "exact" })
      .eq("status", "erro_integracao")
      .order("updated_at", { ascending: false })
      .limit(20),
    service.from("planetchat_sync_runs")
      .select("id,company_id,status,error_message,warning_message,started_at", { count: "exact" })
      .in("status", ["erro", "parcial"])
      .gte("started_at", recentSyncCutoff)
      .order("started_at", { ascending: false })
      .limit(20),
    service.from("api_credentials")
      .select("id,company_id,provider,environment,active,last_test_status,last_tested_at")
      .eq("active", true)
      .order("updated_at", { ascending: false }),
    service.from("digital_certificates")
      .select("id,company_id,label,valid_until,active")
      .eq("active", true)
      .order("valid_until", { ascending: true })
  ]);

  const queryErrors = [
    tenantsResult.error,
    companiesCountResult.error,
    usersResult.error,
    companiesResult.error,
    nfseResult.error,
    chargesResult.error,
    syncRunsResult.error,
    credentialsResult.error,
    certificatesResult.error
  ].filter(Boolean);
  const companies = (companiesResult.data || []) as CompanyRow[];
  const companyNames = new Map(companies.map((company) => [company.id, company.name]));
  const credentialIssues = (credentialsResult.data || []).filter((credential) => credential.last_test_status !== "conectado");
  const certificateIssues = (certificatesResult.data || []).filter((certificate) => certificateState(certificate.valid_until) !== "Valido");

  const incidents: Incident[] = [
    ...(nfseResult.data || []).map((row) => ({
      id: row.id,
      companyId: row.company_id,
      module: "NFS-e",
      status: row.status,
      message: row.rejection_message || "Documento fiscal requer revisao.",
      occurredAt: row.created_at
    })),
    ...(chargesResult.data || []).map((row) => ({
      id: row.id,
      companyId: row.company_id,
      module: "Banco Inter",
      status: row.status,
      message: row.rejection_message || "Cobranca com erro de integracao.",
      occurredAt: row.updated_at
    })),
    ...(syncRunsResult.data || []).map((row) => ({
      id: row.id,
      companyId: row.company_id,
      module: "PlanetChat",
      status: row.status,
      message: row.error_message || row.warning_message || "Sincronizacao requer revisao.",
      occurredAt: row.started_at
    }))
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 30);
  const criticalCount = (nfseResult.count || 0) + (chargesResult.count || 0) + (syncRunsResult.count || 0);

  return (
    <>
      <PageHeader
        area="Admin / Saude"
        title="Saude do sistema"
        description="Monitore disponibilidade, integracoes e pendencias operacionais de todos os tenants."
        action={<a className="ghost-button button-link" href="/api/health" target="_blank" rel="noreferrer">Ver endpoint</a>}
      />

      {queryErrors.length ? <div className="form-error">Uma ou mais verificacoes nao responderam. Revise os logs da aplicacao antes de liberar uma versao.</div> : null}

      <section className="metrics dashboard-metrics">
        <MetricCard label="Tenants" value={String(tenantsResult.count || 0)} detail="contas cadastradas" />
        <MetricCard label="Empresas ativas" value={String(companiesCountResult.count || 0)} detail="operacoes em uso" />
        <MetricCard label="Usuarios ativos" value={String(usersResult.count || 0)} detail="perfis habilitados" />
        <MetricCard label="Pendencias criticas" value={String(criticalCount)} detail="fiscal, cobranca e sincronizacao" />
        <MetricCard label="Credenciais" value={String(credentialIssues.length)} detail="integracoes que pedem revisao" />
        <MetricCard label="Certificados" value={String(certificateIssues.length)} detail="expirados ou proximos do vencimento" />
      </section>

      <section className="table-panel">
        <div className="table-panel-heading"><div><h2>Incidentes recentes</h2><span className="muted">Falhas de integracao que exigem acao operacional.</span></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Data</th><th>Empresa</th><th>Modulo</th><th>Status</th><th>Mensagem</th></tr></thead>
            <tbody>
              {incidents.length ? incidents.map((incident) => (
                <tr key={`${incident.module}-${incident.id}`}>
                  <td>{dateTime(incident.occurredAt)}</td>
                  <td>{companyNames.get(incident.companyId) || "Empresa nao encontrada"}</td>
                  <td>{incident.module}</td>
                  <td><StatusBadge tone="warning">{incident.status}</StatusBadge></td>
                  <td className="health-message-cell">{incident.message}</td>
                </tr>
              )) : <tr><td colSpan={5}>Nenhum incidente critico registrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="two-columns health-columns">
        <article className="table-panel">
          <h2>Integracoes ativas</h2>
          <div className="table-wrap"><table><thead><tr><th>Empresa</th><th>Provedor</th><th>Teste</th><th>Status</th></tr></thead><tbody>
            {(credentialsResult.data || []).length ? (credentialsResult.data || []).map((credential) => (
              <tr key={credential.id}><td>{companyNames.get(credential.company_id) || "-"}</td><td>{credential.provider}</td><td>{dateTime(credential.last_tested_at)}</td><td><StatusBadge tone={credential.last_test_status === "conectado" ? "success" : "warning"}>{credential.last_test_status || "nao testada"}</StatusBadge></td></tr>
            )) : <tr><td colSpan={4}>Nenhuma integracao ativa.</td></tr>}
          </tbody></table></div>
        </article>
        <article className="table-panel">
          <h2>Certificados digitais</h2>
          <div className="table-wrap"><table><thead><tr><th>Empresa</th><th>Certificado</th><th>Validade</th><th>Status</th></tr></thead><tbody>
            {(certificatesResult.data || []).length ? (certificatesResult.data || []).map((certificate) => {
              const state = certificateState(certificate.valid_until);
              return <tr key={certificate.id}><td>{companyNames.get(certificate.company_id) || "-"}</td><td>{certificate.label}</td><td>{certificate.valid_until ? new Date(`${certificate.valid_until}T00:00:00`).toLocaleDateString("pt-BR") : "-"}</td><td><StatusBadge tone={state === "Valido" ? "success" : "warning"}>{state}</StatusBadge></td></tr>;
            }) : <tr><td colSpan={4}>Nenhum certificado ativo.</td></tr>}
          </tbody></table></div>
        </article>
      </section>
    </>
  );
}
