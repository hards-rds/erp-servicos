import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams?: Promise<{ status?: string; from?: string; to?: string; q?: string; page?: string; imported?: string; events?: string; messages?: string; matched?: string }>;
};
type Relation<T> = T | T[] | null;
type SupportRow = {
  id: string;
  protocol: string | null;
  status_code: number | null;
  status_label: string;
  contact_name: string | null;
  contact_phone: string | null;
  source_name: string | null;
  channel_name: string | null;
  queue_name: string | null;
  attendant_name: string | null;
  started_at: string | null;
  ended_at: string | null;
  service_seconds: number | null;
  survey_score: number | string | null;
  match_status: string;
  clients: Relation<{ legal_name: string }>;
  contracts: Relation<{ service_description: string }>;
};
type SummaryRow = {
  total: number | string;
  closed: number | string;
  matched: number | string;
  total_service_seconds: number | string;
  average_wait_seconds: number | string;
  average_service_seconds: number | string;
  average_survey_score: number | string | null;
};

const messages: Record<string, { kind: "success" | "error"; text: string }> = {
  synced: { kind: "success", text: "Atendimentos, eventos e metricas da PlanetChat foram sincronizados." },
  sync_partial: { kind: "success", text: "Atendimentos sincronizados. Algumas metricas de atendentes nao estavam disponiveis para este token." },
  sync_error: { kind: "error", text: "Nao foi possivel sincronizar a PlanetChat. Verifique a integracao e o historico da ultima execucao." },
  period_invalid: { kind: "error", text: "Escolha um periodo valido de ate 90 dias." },
  profile_error: { kind: "error", text: "Seu usuario nao esta ativo ou vinculado a uma empresa." },
  segment_error: { kind: "error", text: "Chamados da PlanetChat estao disponiveis somente para tenants de Tecnologia." },
  plan_feature: { kind: "error", text: "Sincronizacoes com APIs exigem o plano Pro ou Enterprise." },
  linked: { kind: "success", text: "Chamado vinculado ao cliente e contrato selecionados." },
  link_invalid: { kind: "error", text: "Cliente ou contrato invalido para o tenant ativo." },
  link_error: { kind: "error", text: "Nao foi possivel atualizar o vinculo do chamado." }
};

const pageSize = 50;

function safeDate(value: string | undefined, fallback: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value as string : fallback;
}

function safeSearch(value: string | undefined) {
  return String(value || "").replace(/[^\p{L}\p{N}\s@._+()-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function first<T>(relation: Relation<T>) {
  return Array.isArray(relation) ? relation[0] : relation;
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR") : "-";
}

function formatDuration(value: number | string | null | undefined) {
  const total = Math.max(0, Math.round(Number(value || 0)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours) return `${hours}h ${minutes}min`;
  if (minutes) return `${minutes}min ${seconds}s`;
  return `${seconds}s`;
}

function tone(statusCode: number | null) {
  if (statusCode === 4) return "success" as const;
  if ([2, 3, 7].includes(Number(statusCode))) return "warning" as const;
  return "neutral" as const;
}

function pageUrl(page: number, from: string, to: string, search: string) {
  const params = new URLSearchParams({ from, to });
  if (search) params.set("q", search);
  if (page > 1) params.set("page", String(page));
  return `/operacao/chamados?${params.toString()}`;
}

export default async function ChamadosPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const today = new Date();
  const defaultTo = today.toISOString().slice(0, 10);
  const defaultFrom = new Date(today.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  const from = safeDate(params?.from, defaultFrom);
  const to = safeDate(params?.to, defaultTo);
  const search = safeSearch(params?.q);
  const requestedPage = Math.max(1, Number.parseInt(params?.page || "1", 10) || 1);
  const start = new Date(`${from}T00:00:00.000-03:00`).toISOString();
  const end = new Date(`${to}T23:59:59.999-03:00`).toISOString();
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };
  const { data: company } = profile?.company_id
    ? await supabase.from("companies").select("service_segment").eq("id", profile.company_id).maybeSingle()
    : { data: null };
  const isTechnology = company?.service_segment === "tecnologia";
  const service = createServiceClient();

  let query = profile?.company_id && isTechnology
    ? supabase.from("support_orders")
      .select("id,protocol,status_code,status_label,contact_name,contact_phone,source_name,channel_name,queue_name,attendant_name,started_at,ended_at,service_seconds,survey_score,match_status,clients(legal_name),contracts(service_description)", { count: "exact" })
      .eq("company_id", profile.company_id)
      .gte("started_at", start)
      .lte("started_at", end)
    : null;
  if (query && search) {
    query = query.or(`protocol.ilike.%${search}%,contact_name.ilike.%${search}%,source_name.ilike.%${search}%,contact_phone.ilike.%${search}%`);
  }
  const rangeStart = (requestedPage - 1) * pageSize;
  const [{ data: orders, count }, { data: summary }, { data: credential }, { data: latestRun }, { data: attendantMetrics }] = profile?.company_id && isTechnology
    ? await Promise.all([
      query!.order("started_at", { ascending: false }).range(rangeStart, rangeStart + pageSize - 1),
      supabase.rpc("planetchat_support_summary", { p_company_id: profile.company_id, p_from: start, p_to: end }),
      service.from("api_credentials").select("active").eq("company_id", profile.company_id).eq("provider", "planetchat").eq("environment", "production").maybeSingle(),
      supabase.from("planetchat_sync_runs").select("status,started_at,warning_message,error_message").eq("company_id", profile.company_id).order("started_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("planetchat_attendant_metrics").select("user_name,total_customer_services,closed_customer_services,total_messages,tma_seconds,tmia_seconds,tmu_seconds,average_survey_score").eq("company_id", profile.company_id).gte("period_start", start).lte("period_end", end).order("total_customer_services", { ascending: false }).limit(20)
    ])
    : [{ data: [], count: 0 }, { data: [] }, { data: null }, { data: null }, { data: [] }];
  const rows = (orders || []) as SupportRow[];
  const totals = ((summary || []) as SummaryRow[])[0];
  const total = count || 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const message = params?.status ? messages[params.status] : !isTechnology ? messages.segment_error : null;

  return (
    <>
      <PageHeader
        area="Operacao / Chamados"
        title="Chamados PlanetChat"
        description="Historico de atendimentos do WhatsApp, ordens de servico, tempos e desempenho da equipe."
        action={<a className="ghost-button button-link" href="/configuracoes/apis/planetchat">Configurar PlanetChat</a>}
      />
      {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}{params?.status?.startsWith("sync") ? ` ${params.imported || 0} chamados, ${params.events || 0} eventos e ${params.messages || 0} mensagens recebidas; ${params.matched || 0} clientes vinculados.` : ""}</div> : null}
      {!credential?.active && isTechnology ? <div className="form-error">A PlanetChat ainda nao esta ativa para este tenant.</div> : null}
      <section className="form-panel compact-panel">
        <form className="form-stack" action="/api/operacao/chamados" method="post">
          <input type="hidden" name="action" value="sync" />
          <div className="form-grid support-sync-grid">
            <label>De<input name="from" type="date" defaultValue={from} required /></label>
            <label>Ate<input name="to" type="date" defaultValue={to} required /></label>
            <button className="primary-button" type="submit" disabled={!credential?.active}>Sincronizar PlanetChat</button>
          </div>
        </form>
        <div className="muted">Ultima execucao: {latestRun ? `${formatDateTime(latestRun.started_at)} · ${latestRun.status}` : "nenhuma"}{latestRun?.warning_message ? ` · ${latestRun.warning_message}` : ""}{latestRun?.error_message ? ` · ${latestRun.error_message}` : ""}</div>
      </section>
      <section className="metrics">
        <MetricCard label="Atendimentos" value={new Intl.NumberFormat("pt-BR").format(Number(totals?.total || 0))} detail={`${Number(totals?.closed || 0)} encerrados`} />
        <MetricCard label="Tempo atendido" value={formatDuration(totals?.total_service_seconds)} detail={`media ${formatDuration(totals?.average_service_seconds)}`} />
        <MetricCard label="Espera media" value={formatDuration(totals?.average_wait_seconds)} detail="ate o primeiro atendimento" />
        <MetricCard label="Clientes vinculados" value={new Intl.NumberFormat("pt-BR").format(Number(totals?.matched || 0))} detail={totals?.average_survey_score ? `CSAT ${Number(totals.average_survey_score).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}` : "sem pesquisa no periodo"} />
      </section>
      <section className="table-panel">
        <div className="table-panel-heading">
          <div><h2>Ordens de servico importadas</h2><span className="list-count">{new Intl.NumberFormat("pt-BR").format(total)} registros</span></div>
          <form className={`list-search${search ? "" : " single-action"}`} action="/operacao/chamados" method="get">
            <input type="hidden" name="from" value={from} /><input type="hidden" name="to" value={to} />
            <label className="sr-only" htmlFor="support-search">Buscar chamado</label>
            <input id="support-search" name="q" type="search" defaultValue={search} placeholder="Protocolo, contato ou telefone" />
            <button className="ghost-button" type="submit">Buscar</button>
            {search ? <a className="ghost-button button-link" href={pageUrl(1, from, to, "")}>Limpar</a> : null}
          </form>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Inicio</th><th>Protocolo / contato</th><th>Cliente / contrato</th><th>Fila / atendente</th><th>Tempo</th><th>Status</th><th>Acoes</th></tr></thead>
            <tbody>{rows.length ? rows.map((order) => {
              const client = first(order.clients);
              const contract = first(order.contracts);
              return <tr key={order.id}>
                <td>{formatDateTime(order.started_at)}</td>
                <td><strong>{order.protocol || "Sem protocolo"}</strong><div className="muted">{order.contact_name || order.source_name || order.contact_phone || "Contato nao identificado"} · {order.channel_name || "canal nao informado"}</div></td>
                <td>{client?.legal_name || <span className="muted">Nao vinculado</span>}{contract ? <div className="muted">{contract.service_description}</div> : null}</td>
                <td>{order.queue_name || "-"}<div className="muted">{order.attendant_name || "Sem atendente"}</div></td>
                <td>{formatDuration(order.service_seconds)}</td>
                <td><StatusBadge tone={tone(order.status_code)}>{order.status_label}</StatusBadge>{order.match_status === "ambiguo" ? <div className="muted">vinculo ambiguo</div> : null}</td>
                <td><RowActionsMenu label={`Acoes do chamado ${order.protocol || order.id}`}><a className="ghost-button button-link compact-button" href={`/operacao/chamados/${order.id}`}>Ver detalhes</a></RowActionsMenu></td>
              </tr>;
            }) : <tr><td colSpan={7}>Nenhum chamado encontrado neste periodo.</td></tr>}</tbody>
          </table>
        </div>
        <nav className="pagination" aria-label="Paginacao de chamados">
          <span className="pagination-summary">Pagina {Math.min(requestedPage, pages)} de {pages}</span>
          <div className="pagination-actions">
            {requestedPage > 1 ? <a className="ghost-button button-link compact-button" href={pageUrl(requestedPage - 1, from, to, search)}>Anterior</a> : <span className="ghost-button compact-button disabled-control">Anterior</span>}
            {requestedPage < pages ? <a className="ghost-button button-link compact-button" href={pageUrl(requestedPage + 1, from, to, search)}>Proxima</a> : <span className="ghost-button compact-button disabled-control">Proxima</span>}
          </div>
        </nav>
      </section>
      <section className="table-panel">
        <h2>Metricas por atendente</h2>
        <div className="table-wrap"><table><thead><tr><th>Atendente</th><th>Atendimentos</th><th>Encerrados</th><th>Mensagens</th><th>TMU</th><th>TMIA</th><th>TMA</th><th>CSAT</th></tr></thead>
          <tbody>{(attendantMetrics || []).length ? attendantMetrics!.map((metric, index) => <tr key={`${metric.user_name}-${index}`}><td>{metric.user_name}</td><td>{metric.total_customer_services}</td><td>{metric.closed_customer_services}</td><td>{metric.total_messages}</td><td>{formatDuration(metric.tmu_seconds)}</td><td>{formatDuration(metric.tmia_seconds)}</td><td>{formatDuration(metric.tma_seconds)}</td><td>{metric.average_survey_score ?? "-"}</td></tr>) : <tr><td colSpan={8}>As metricas de atendentes aparecerao apos uma sincronizacao com permissao de Supervisor.</td></tr>}</tbody>
        </table></div>
      </section>
    </>
  );
}
