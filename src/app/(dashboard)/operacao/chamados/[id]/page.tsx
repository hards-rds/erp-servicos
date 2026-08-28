import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;
type Relation<T> = T | T[] | null;
type ClientOption = { id: string; legal_name: string };
type ContractOption = { id: string; client_id: string; service_description: string; status: string };

function first<T>(relation: Relation<T>) {
  return Array.isArray(relation) ? relation[0] : relation;
}

function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR") : "-";
}

function duration(value: number | null) {
  const total = Math.max(0, Math.round(Number(value || 0)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours ? `${hours}h ${minutes}min` : minutes ? `${minutes}min ${seconds}s` : `${seconds}s`;
}

function pretty(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

export default async function ChamadoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };
  if (!profile?.company_id) notFound();
  const [{ data: order }, { data: events }, { data: messages }, { data: clients }, { data: contracts }] = await Promise.all([
    supabase.from("support_orders").select("*,clients(legal_name),contracts(service_description)").eq("id", id).eq("company_id", profile.company_id).maybeSingle(),
    supabase.from("support_order_events").select("id,action,occurred_at,payload").eq("support_order_id", id).eq("company_id", profile.company_id).order("occurred_at"),
    supabase.from("support_order_messages").select("id,direction,message_type,text_content,delivery_status,sent_by_name,sent_at,attachments,payload").eq("support_order_id", id).eq("company_id", profile.company_id).order("sent_at"),
    supabase.from("clients").select("id,legal_name").eq("company_id", profile.company_id).eq("status", "ativo").order("legal_name").limit(1000),
    supabase.from("contracts").select("id,client_id,service_description,status").eq("company_id", profile.company_id).eq("status", "ativo").order("created_at", { ascending: false }).limit(1000)
  ]);
  if (!order) notFound();
  const client = first(order.clients as Relation<{ legal_name: string }>);
  const contract = first(order.contracts as Relation<{ service_description: string }>);
  const labels: unknown[] = Array.isArray(order.labels) ? order.labels : [];

  return (
    <>
      <PageHeader
        area="Operacao / Chamados / Detalhes"
        title={`Chamado ${order.protocol || String(order.external_id).slice(0, 12)}`}
        description="Ordem de servico importada da PlanetChat com dados, tempos e trilha de eventos preservados."
        action={<Link className="ghost-button button-link" href="/operacao/chamados">Voltar aos chamados</Link>}
      />
      <section className="form-panel">
        <div className="support-detail-grid">
          <div><span className="muted">Status</span><strong><StatusBadge tone={order.status_code === 4 ? "success" : "warning"}>{order.status_label}</StatusBadge></strong></div>
          <div><span className="muted">Contato</span><strong>{order.contact_name || order.source_name || "Nao identificado"}</strong><small>{order.contact_phone || order.contact_email || "-"}</small></div>
          <div><span className="muted">Cliente</span><strong>{client?.legal_name || "Nao vinculado"}</strong><small>{contract?.service_description || "Sem contrato definido"}</small></div>
          <div><span className="muted">Canal e fila</span><strong>{order.channel_name || order.channel_type || "-"}</strong><small>{order.queue_name || "-"}</small></div>
          <div><span className="muted">Atendente</span><strong>{order.attendant_name || "Sem atendente"}</strong><small>{order.attendant_email || "-"}</small></div>
          <div><span className="muted">Periodo</span><strong>{dateTime(order.started_at)}</strong><small>ate {dateTime(order.ended_at)}</small></div>
          <div><span className="muted">Espera</span><strong>{duration(order.wait_seconds)}</strong><small>primeiro atendimento {dateTime(order.first_attended_at)}</small></div>
          <div><span className="muted">Tempo de atendimento</span><strong>{duration(order.service_seconds)}</strong><small>duracao total {duration(order.duration_seconds)}</small></div>
          <div><span className="muted">Pesquisa</span><strong>{order.survey_score ?? "Sem resposta"}</strong><small>{order.has_alert_words ? "Contem palavra de alerta" : "Sem alerta informado"}</small></div>
        </div>
      </section>
      <section className="form-panel">
        <h2>Vinculo com cliente e contrato</h2>
        <form className="form-stack" action="/api/operacao/chamados" method="post">
          <input type="hidden" name="action" value="link" /><input type="hidden" name="supportOrderId" value={order.id} />
          <div className="form-grid">
            <label>Cliente<select name="clientId" defaultValue={order.client_id || ""} required><option value="" disabled>Selecione</option>{((clients || []) as ClientOption[]).map((item) => <option key={item.id} value={item.id}>{item.legal_name}</option>)}</select></label>
            <label>Contrato<select name="contractId" defaultValue={order.contract_id || ""}><option value="">Sem contrato</option>{((contracts || []) as ContractOption[]).map((item) => <option key={item.id} value={item.id}>{item.service_description}</option>)}</select></label>
          </div>
          <button className="primary-button" type="submit">Salvar vinculo manual</button>
        </form>
      </section>
      <section className="table-panel">
        <h2>Linha do tempo</h2>
        <div className="support-timeline">{(events || []).length ? events!.map((event) => <div className="support-event" key={event.id}><span>{dateTime(event.occurred_at)}</span><strong>{event.action}</strong></div>) : <p className="muted">Nenhum evento recebido para este atendimento.</p>}</div>
      </section>
      <section className="table-panel">
        <h2>Historico da conversa</h2>
        {(messages || []).length ? <div className="support-messages">{messages!.map((message) => <article className="support-message" key={message.id}><header><strong>{message.sent_by_name || message.direction || "Mensagem"}</strong><span>{dateTime(message.sent_at)} · {message.delivery_status || message.message_type || "-"}</span></header><p>{message.text_content || "Mensagem sem texto"}</p>{Array.isArray(message.attachments) && message.attachments.length ? <small>{message.attachments.length} anexo(s)</small> : null}</article>)}</div> : <p className="muted">O endpoint publico documentado da PlanetChat nao enviou o conteudo das mensagens deste atendimento. Os eventos, identificacao e metricas foram preservados; a tabela ja esta pronta para receber as mensagens quando a PlanetChat liberar o endpoint de CHAT_READ.</p>}
      </section>
      <section className="table-panel">
        <h2>Dados adicionais</h2>
        <div className="support-detail-grid">
          <div><span className="muted">Etiquetas</span><strong>{labels.length ? labels.map((item) => typeof item === "string" ? item : String((item as JsonRecord).name || (item as JsonRecord).id || "etiqueta")).join(", ") : "-"}</strong></div>
          <div><span className="muted">Qualificacao</span><strong>{Object.keys((order.qualification_response || {}) as JsonRecord).length ? "Recebida" : "Nao informada"}</strong></div>
        </div>
        <details className="raw-data"><summary>Ver qualificacao e payload original</summary><h3>Qualificacao</h3><pre>{pretty(order.qualification_response)}</pre><h3>Payload PlanetChat</h3><pre>{pretty(order.raw_payload)}</pre></details>
      </section>
    </>
  );
}
