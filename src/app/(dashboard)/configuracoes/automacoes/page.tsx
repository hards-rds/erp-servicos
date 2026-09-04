import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { CompetenceFilter } from "@/components/ui/competence-filter";
import { resolveCompetence } from "@/lib/dates/competence";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type PageProps = { searchParams?: Promise<{ status?: string; processed?: string; partial?: string; failed?: string; alerts?: string; competence?: string }> };
type RunRow = { id: string; source_type: "contract" | "school_enrollment"; source_id: string; competence: string; status: string; error_message: string | null; started_at: string; finished_at: string | null; result: { warnings?: string[] } | null };
function dateTime(value: string | null) { return value ? new Date(value).toLocaleString("pt-BR") : "-"; }

export default async function AutomationsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const competence = resolveCompetence(params?.competence);
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle() : { data: null };
  const companyId = profile?.company_id;
  const [{ data: company }, financialResult, nfseResult, chargeResult, enrollmentResult, runsResult] = companyId ? await Promise.all([
    supabase.from("companies").select("service_segment").eq("id", companyId).maybeSingle(),
    supabase.from("contracts").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "ativo").eq("auto_generate_financial", true),
    supabase.from("contracts").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "ativo").eq("auto_issue_nfse", true),
    supabase.from("contracts").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "ativo").eq("auto_generate_charge", true),
    supabase.from("school_enrollments").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "ativa").eq("auto_generate_financial", true),
    supabase.from("recurrence_runs").select("id,source_type,source_id,competence,status,error_message,started_at,finished_at,result").eq("company_id", companyId).eq("competence", competence).order("started_at", { ascending: false }).limit(500)
  ]) : [{ data: null }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { data: [] }];
  const runs = (runsResult.data || []) as RunRow[];
  const contractIds = runs.filter((run) => run.source_type === "contract").map((run) => run.source_id);
  const enrollmentIds = runs.filter((run) => run.source_type === "school_enrollment").map((run) => run.source_id);
  const [{ data: runContracts }, { data: runEnrollments }] = companyId ? await Promise.all([
    contractIds.length ? supabase.from("contracts").select("id,service_description").eq("company_id", companyId).in("id", contractIds) : Promise.resolve({ data: [] }),
    enrollmentIds.length ? supabase.from("school_enrollments").select("id,school_athletes(full_name)").eq("company_id", companyId).in("id", enrollmentIds) : Promise.resolve({ data: [] })
  ]) : [{ data: [] }, { data: [] }];
  const sourceNames = new Map((runContracts || []).map((contract) => [contract.id, contract.service_description]));
  for (const enrollment of runEnrollments || []) {
    const athlete = Array.isArray(enrollment.school_athletes) ? enrollment.school_athletes[0] : enrollment.school_athletes;
    sourceNames.set(enrollment.id, `Mensalidade - ${athlete?.full_name || "Atleta"}`);
  }
  const issues = runs.filter((run) => ["parcial", "erro"].includes(run.status)).length;
  const processedPartial = Number(params?.partial || 0);
  const processedFailed = Number(params?.failed || 0);
  const message = params?.status === "processed"
    ? { kind: processedFailed > 0 ? "error" : processedPartial > 0 ? "warning" : "success", text: `Processamento concluido: ${params.processed || 0} recorrencias, ${processedPartial} com pendencias, ${processedFailed} com erro e ${params.alerts || 0} alertas financeiros analisados.` }
    : params?.status ? { kind: "error", text: params.status === "forbidden" ? "Seu perfil nao pode executar automacoes." : params.status === "plan_feature" ? "Automacoes recorrentes exigem o plano Pro ou Enterprise." : "Nao foi possivel executar as automacoes agora." } : null;

  return <>
    <PageHeader area="Configuracoes / Automacoes" title="Automacoes recorrentes" description="Controle competencias financeiras, fila fiscal e cobrancas da empresa ativa." action={<form action="/api/configuracoes/automacoes" method="post"><input type="hidden" name="competence" value={competence} /><button className="primary-button" type="submit">Executar agora</button></form>} />
    <CompetenceFilter value={competence} pathname="/configuracoes/automacoes" />
    {message ? <div className={message.kind === "success" ? "form-success" : message.kind === "warning" ? "form-warning" : "form-error"}>{message.text}</div> : null}
    <section className="metrics dashboard-metrics">
      <MetricCard label="Financeiro automatico" value={String(financialResult.count || 0)} detail="contratos ativos" />
      <MetricCard label="Fila de NFS-e" value={String(nfseResult.count || 0)} detail="sempre exige conferencia" />
      <MetricCard label="Cobranca automatica" value={String(chargeResult.count || 0)} detail="depende do Banco Inter" />
      {company?.service_segment === "escola_futebol" ? <MetricCard label="Mensalidades automaticas" value={String(enrollmentResult.count || 0)} detail="matriculas ativas" /> : null}
      <MetricCard label="Pendencias recentes" value={String(issues)} detail="execucoes parciais ou com erro" />
    </section>
    <section className="table-panel"><div className="table-panel-heading"><div><h2>Historico de processamento</h2><span className="muted">Falhas e competencias com documento cancelado podem ser retomadas com seguranca.</span></div><a className="ghost-button button-link" href={company?.service_segment === "escola_futebol" ? "/escola/matriculas" : "/cadastros/contratos"}>Configurar recorrencias</a></div><div className="table-wrap"><table><thead><tr><th>Inicio</th><th>Origem</th><th>Competencia</th><th>Status</th><th>Detalhes</th></tr></thead><tbody>
      {runs.length ? runs.map((run) => <tr key={run.id}><td>{dateTime(run.started_at)}</td><td>{sourceNames.get(run.source_id) || "Recorrencia"}</td><td>{run.competence}</td><td><StatusBadge tone={run.status === "concluido" ? "success" : run.status === "erro" ? "warning" : "neutral"}>{run.status}</StatusBadge></td><td>{run.error_message || run.result?.warnings?.join(" ") || `Finalizado em ${dateTime(run.finished_at)}`}</td></tr>) : <tr><td colSpan={5}>Nenhuma competencia automatizada ainda.</td></tr>}
    </tbody></table></div></section>
  </>;
}
