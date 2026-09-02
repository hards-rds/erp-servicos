import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { pilotProgress, type PilotCheckStatus } from "@/domains/pilot/checklist";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";

type PilotRow = { id: string; tenant_id: string; status: string; target_end_at: string | null; tenant_pilot_checks: { check_key: string; required: boolean; status: string }[] | null };
type TenantRow = { id: string; name: string; plan: string; status: string; companies: { name: string; service_segment: string | null }[] | null };

const messages: Record<string, { type: "success" | "error"; text: string }> = {
  forbidden: { type: "error", text: "Acesso restrito ao administrador do sistema." },
  invalid: { type: "error", text: "Nao foi possivel identificar o tenant do piloto." }
};

const statusLabels: Record<string, string> = { planned: "Planejado", running: "Em validacao", blocked: "Bloqueado", approved: "Aprovado", cancelled: "Cancelado" };
const segmentLabels: Record<string, string> = { tecnologia: "Tecnologia", otica: "Otica", escola_futebol: "Escola de futebol", transportadora: "Transportadora", generico: "Generico" };

export default async function PilotsPage({ searchParams }: { searchParams?: Promise<{ status?: string }> }) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("role,active").eq("id", user.id).maybeSingle() : { data: null };
  if (profile?.role !== "system_admin" || profile.active === false) notFound();

  const service = createServiceClient();
  const [{ data: tenants }, { data: pilots }] = await Promise.all([
    service.from("tenants").select("id,name,plan,status,companies(name,service_segment)").order("name"),
    service.from("tenant_pilots").select("id,tenant_id,status,target_end_at,tenant_pilot_checks(check_key,required,status)")
  ]);
  const allTenants = (tenants || []) as TenantRow[];
  const pilotsByTenant = new Map(((pilots || []) as PilotRow[]).map((pilot) => [pilot.tenant_id, pilot]));
  const running = (pilots || []).filter((pilot) => pilot.status === "running").length;
  const blocked = (pilots || []).filter((pilot) => pilot.status === "blocked").length;
  const approved = (pilots || []).filter((pilot) => pilot.status === "approved").length;
  const message = params?.status ? messages[params.status] : null;

  return <>
    <PageHeader area="Admin / Pilotos" title="Pilotos controlados" description="Valide seguranca, operacao e aceite por segmento antes da liberacao comercial." />
    {message ? <div className={message.type === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
    <section className="metrics onboarding-metrics">
      <MetricCard label="Em validacao" value={String(running)} detail="pilotos em andamento" />
      <MetricCard label="Bloqueados" value={String(blocked)} detail="exigem correcao" />
      <MetricCard label="Aprovados" value={String(approved)} detail="aptos para liberacao" />
    </section>
    <section className="table-panel">
      <div className="table-panel-heading"><div><h2>Empresas candidatas</h2><span className="muted">Cada tenant possui um checklist unico, complementado pelo seu segmento.</span></div></div>
      <div className="table-wrap"><table><thead><tr><th>Tenant</th><th>Empresa</th><th>Segmento</th><th>Plano</th><th>Piloto</th><th>Progresso</th><th>Prazo</th><th>Acoes</th></tr></thead><tbody>
        {allTenants.length ? allTenants.map((tenant) => {
          const pilot = pilotsByTenant.get(tenant.id);
          const progress = pilot ? pilotProgress((pilot.tenant_pilot_checks || []).map((check) => ({ key: check.check_key, required: check.required, status: check.status as PilotCheckStatus }))) : null;
          return <tr key={tenant.id}>
            <td><strong>{tenant.name}</strong><div className="muted">{tenant.status}</div></td>
            <td>{(tenant.companies || []).map((company) => company.name).join(", ") || "-"}</td>
            <td>{(tenant.companies || []).map((company) => segmentLabels[company.service_segment || ""] || company.service_segment || "-").join(", ") || "-"}</td>
            <td>{tenant.plan}</td>
            <td>{pilot ? <StatusBadge tone={pilot.status === "approved" ? "success" : "warning"}>{statusLabels[pilot.status] || pilot.status}</StatusBadge> : <StatusBadge>Nao iniciado</StatusBadge>}</td>
            <td>{progress ? `${progress.passed}/${progress.total} (${progress.percent}%)` : "-"}</td>
            <td>{pilot?.target_end_at ? new Intl.DateTimeFormat("pt-BR").format(new Date(`${pilot.target_end_at}T12:00:00`)) : "-"}</td>
            <td><a className="ghost-button button-link compact-button" href={`/admin/pilotos/${tenant.id}`}>{pilot ? "Abrir piloto" : "Iniciar piloto"}</a></td>
          </tr>;
        }) : <tr><td colSpan={8}>Nenhum tenant cadastrado.</td></tr>}
      </tbody></table></div>
    </section>
  </>;
}
