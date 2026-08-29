import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { buildPilotChecklist, canApprovePilot, pilotProgress, type PilotCheckStatus, type PilotSegment } from "@/domains/pilot/checklist";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { countPilotBlockers, getTenantPilotReadiness } from "@/server/services/pilot-readiness-service";

type TenantRow = { id: string; name: string; plan: string; status: string; companies: { id: string; name: string; service_segment: string | null; active: boolean }[] | null };
type PilotRow = { id: string; status: string; started_at: string | null; target_end_at: string | null; approved_at: string | null; notes: string | null };
type CheckRow = { id: string; check_key: string; category: string; title: string; description: string; required: boolean; status: string; evidence: string | null; notes: string | null; checked_at: string | null };

const messages: Record<string, { type: "success" | "error"; text: string }> = {
  started: { type: "success", text: "Piloto iniciado e checklist criado para os segmentos do tenant." },
  refreshed: { type: "success", text: "Checklist atualizado sem alterar as validacoes existentes." },
  check_saved: { type: "success", text: "Criterio atualizado." },
  status_saved: { type: "success", text: "Status do piloto atualizado." },
  approval_blocked: { type: "error", text: "O piloto ainda possui criterios obrigatorios ou bloqueadores automaticos pendentes." },
  not_started: { type: "error", text: "Inicie o piloto antes de registrar validacoes." },
  invalid: { type: "error", text: "Revise os dados informados." },
  error: { type: "error", text: "Nao foi possivel atualizar o piloto agora." },
  forbidden: { type: "error", text: "Acesso restrito ao administrador do sistema." }
};

const statusLabels: Record<string, string> = { planned: "Planejado", running: "Em validacao", blocked: "Bloqueado", approved: "Aprovado", cancelled: "Cancelado", pending: "Pendente", passed: "Aprovado", failed: "Falhou", not_applicable: "Nao aplicavel" };

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("pt-BR").format(new Date(value.includes("T") ? value : `${value}T12:00:00`)) : "-";
}

export default async function PilotDetailsPage({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams?: Promise<{ status?: string }> }) {
  const { tenantId } = await params;
  const query = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("role,active").eq("id", user.id).maybeSingle() : { data: null };
  if (profile?.role !== "system_admin" || profile.active === false) notFound();

  const service = createServiceClient();
  const [{ data: tenantData }, { data: pilotData }, readiness] = await Promise.all([
    service.from("tenants").select("id,name,plan,status,companies(id,name,service_segment,active)").eq("id", tenantId).maybeSingle(),
    service.from("tenant_pilots").select("id,status,started_at,target_end_at,approved_at,notes").eq("tenant_id", tenantId).maybeSingle(),
    getTenantPilotReadiness(tenantId)
  ]);
  if (!tenantData) notFound();
  const tenant = tenantData as TenantRow;
  const pilot = pilotData as PilotRow | null;
  const { data: checkData } = pilot
    ? await service.from("tenant_pilot_checks").select("id,check_key,category,title,description,required,status,evidence,notes,checked_at").eq("pilot_id", pilot.id).order("category").order("title")
    : { data: [] };
  const checks = (checkData || []) as CheckRow[];
  const progress = pilotProgress(checks.map((check) => ({ key: check.check_key, required: check.required, status: check.status as PilotCheckStatus })));
  const blockers = countPilotBlockers(readiness);
  const canApprove = canApprovePilot(checks.map((check) => ({ key: check.check_key, required: check.required, status: check.status as PilotCheckStatus })), blockers);
  const validSegments = new Set<PilotSegment>(["tecnologia", "otica", "escola_futebol", "generico"]);
  const segments = (tenant.companies || []).map((company) => company.service_segment as PilotSegment).filter((segment) => validSegments.has(segment));
  const preview = buildPilotChecklist(segments);
  const message = query?.status ? messages[query.status] : null;
  const defaultTarget = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

  return <>
    <PageHeader
      area="Admin / Pilotos"
      title={tenant.name}
      description={`Piloto controlado do plano ${tenant.plan}. ${tenant.companies?.map((company) => company.name).join(", ") || "Sem empresa vinculada"}.`}
      action={<Link className="ghost-button button-link" href="/admin/pilotos">Voltar aos pilotos</Link>}
    />
    {message ? <div className={message.type === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}

    {!pilot ? <section className="form-panel page-form-panel">
      <div className="table-panel-heading"><div><h2>Iniciar piloto</h2><span className="muted">Serao criados {preview.length} criterios para este tenant.</span></div></div>
      <form action="/api/admin/pilotos" method="post" className="stack-form">
        <input type="hidden" name="action" value="start" /><input type="hidden" name="tenantId" value={tenant.id} />
        <div className="form-grid">
          <label>Prazo previsto<input type="date" name="targetEndAt" defaultValue={defaultTarget} required /></label>
          <label>Coordenacao<input value="Administrador do sistema" readOnly /></label>
        </div>
        <label>Observacoes<textarea name="notes" rows={4} placeholder="Escopo, usuarios participantes e combinados do piloto" /></label>
        <div className="page-form-actions"><button className="primary-button" type="submit">Iniciar piloto controlado</button></div>
      </form>
    </section> : <>
      <section className="metrics dashboard-metrics">
        <MetricCard label="Progresso obrigatorio" value={`${progress.percent}%`} detail={`${progress.passed} de ${progress.total} aprovados`} />
        <MetricCard label="Pendencias" value={String(progress.pending)} detail={`${progress.failed} criterio(s) com falha`} />
        <MetricCard label="Bloqueadores automaticos" value={String(blockers)} detail={blockers ? "exigem correcao" : "ambiente operacional"} />
      </section>

      <section className="table-panel pilot-status-panel">
        <div className="table-panel-heading"><div><h2>Controle do piloto</h2><span className="muted">Iniciado em {formatDate(pilot.started_at)}; prazo {formatDate(pilot.target_end_at)}.</span></div><StatusBadge tone={pilot.status === "approved" ? "success" : "warning"}>{statusLabels[pilot.status] || pilot.status}</StatusBadge></div>
        <form action="/api/admin/pilotos" method="post" className="pilot-status-form">
          <input type="hidden" name="action" value="set_status" /><input type="hidden" name="tenantId" value={tenant.id} />
          <label>Observacoes gerais<textarea name="pilotNotes" rows={3} defaultValue={pilot.notes || ""} /></label>
          <div className="page-form-actions">
            <button className="ghost-button" type="submit" name="pilotStatus" value="running">Manter em validacao</button>
            <button className="ghost-button" type="submit" name="pilotStatus" value="blocked">Marcar bloqueado</button>
            <button className="primary-button" type="submit" name="pilotStatus" value="approved" disabled={!canApprove} title={canApprove ? "Aprovar piloto" : "Conclua os criterios e bloqueadores antes de aprovar"}>Aprovar piloto</button>
          </div>
        </form>
      </section>

      <section className="table-panel">
        <div className="table-panel-heading"><div><h2>Sinais automaticos</h2><span className="muted">Verificacoes calculadas diretamente a partir do ambiente do tenant.</span></div></div>
        <div className="table-wrap"><table><thead><tr><th>Verificacao</th><th>Resultado</th><th>Detalhe</th></tr></thead><tbody>
          {readiness.map((signal) => <tr key={signal.key}><td>{signal.title}</td><td><StatusBadge tone={signal.passed ? "success" : "warning"}>{signal.passed ? "Aprovado" : "Bloqueado"}</StatusBadge></td><td>{signal.detail}</td></tr>)}
        </tbody></table></div>
      </section>

      <section className="table-panel">
        <div className="table-panel-heading"><div><h2>Checklist de aceite</h2><span className="muted">Registre evidencias objetivas para cada criterio validado.</span></div><form action="/api/admin/pilotos" method="post"><input type="hidden" name="action" value="refresh" /><input type="hidden" name="tenantId" value={tenant.id} /><button className="ghost-button compact-button" type="submit">Atualizar criterios</button></form></div>
        <div className="table-wrap"><table className="pilot-check-table"><thead><tr><th>Categoria</th><th>Criterio</th><th>Obrigatorio</th><th>Status</th><th>Validacao</th></tr></thead><tbody>
          {checks.map((check) => <tr key={check.id}>
            <td>{check.category}</td>
            <td><strong>{check.title}</strong><div className="muted pilot-check-description">{check.description}</div></td>
            <td>{check.required ? "Sim" : "Nao"}</td>
            <td><StatusBadge tone={check.status === "passed" ? "success" : check.status === "pending" || check.status === "not_applicable" ? "neutral" : "warning"}>{statusLabels[check.status] || check.status}</StatusBadge>{check.checked_at ? <div className="muted pilot-check-date">{formatDate(check.checked_at)}</div> : null}</td>
            <td><form action="/api/admin/pilotos" method="post" className="pilot-check-form">
              <input type="hidden" name="action" value="update_check" /><input type="hidden" name="tenantId" value={tenant.id} /><input type="hidden" name="checkId" value={check.id} />
              <select name="checkStatus" defaultValue={check.status} aria-label={`Status de ${check.title}`}><option value="pending">Pendente</option><option value="passed">Aprovado</option><option value="failed">Falhou</option>{!check.required ? <option value="not_applicable">Nao aplicavel</option> : null}</select>
              <input name="evidence" defaultValue={check.evidence || ""} placeholder="Evidencia ou referencia" aria-label={`Evidencia de ${check.title}`} />
              <input name="notes" defaultValue={check.notes || ""} placeholder="Observacao" aria-label={`Observacao de ${check.title}`} />
              <button className="ghost-button compact-button" type="submit">Salvar</button>
            </form></td>
          </tr>)}
        </tbody></table></div>
      </section>
    </>}
  </>;
}
