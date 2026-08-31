import { notFound } from "next/navigation";
import Link from "next/link";
import { CompensationActions } from "@/components/people/compensation-actions";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ItemRow = { id: string; description: string; source_type: string; base_amount: number | string; rate_percent: number | string; commission_amount: number | string };

const messages: Record<string, { kind: "success" | "error"; text: string }> = {
  approved: { kind: "success", text: "Fechamento aprovado e conta a pagar gerada." },
  adjusted: { kind: "success", text: "Ajuste atualizado no fechamento." },
  approve_error: { kind: "error", text: "Nao foi possivel aprovar este fechamento." },
  adjust_error: { kind: "error", text: "Nao foi possivel salvar o ajuste." },
  cancel_error: { kind: "error", text: "Nao foi possivel cancelar este fechamento." },
  settled: { kind: "error", text: "O pagamento ja foi baixado ou conciliado e nao pode ser cancelado." },
  locked: { kind: "error", text: "Fechamentos aprovados nao podem mais ser alterados." },
  invalid: { kind: "error", text: "O ajuste informado deixaria o total invalido." }
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusTone(status: string) {
  if (status === "pago") return "success" as const;
  if (["rascunho", "aprovado"].includes(status)) return "warning" as const;
  return "neutral" as const;
}

export default async function FechamentoDetalhePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ status?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle() : { data: null };
  if (!profile?.company_id) notFound();
  const [{ data: compensation }, { data: items }] = await Promise.all([
    supabase.from("contractor_compensations")
      .select("*,contractor:contractors(legal_name,trade_name,tax_id,role_title,commission_basis)")
      .eq("id", id).eq("company_id", profile.company_id).maybeSingle(),
    supabase.from("contractor_compensation_items")
      .select("id,description,source_type,base_amount,rate_percent,commission_amount")
      .eq("compensation_id", id).eq("company_id", profile.company_id)
      .order("description")
  ]);
  if (!compensation) notFound();
  const contractor = Array.isArray(compensation.contractor) ? compensation.contractor[0] : compensation.contractor;
  const name = contractor?.trade_name || contractor?.legal_name || "Prestador PJ";
  const itemRows = (items || []) as ItemRow[];
  const message = query?.status ? messages[query.status] : null;

  return (
    <>
      <PageHeader
        area="Pessoas / Fechamentos / Conferencia"
        title={name}
        description={`Memoria do fechamento ${compensation.competence}. A aprovacao cria uma unica conta a pagar.`}
        action={(
          <>
            <Link className="ghost-button button-link" href={`/pessoas/fechamentos?competence=${compensation.competence}`}>Voltar</Link>
            <CompensationActions id={compensation.id} status={compensation.status} />
          </>
        )}
      />
      {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
      <section className="metrics">
        <MetricCard label="Fixo" value={formatMoney(compensation.fixed_amount)} detail={contractor?.role_title || "Prestacao PJ"} />
        <MetricCard label="Ajuda de custo" value={formatMoney(compensation.cost_allowance_amount)} detail="Valor mensal" />
        <MetricCard label="Comissao" value={formatMoney(compensation.commission_amount)} detail={`${Number(compensation.commission_rate).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}% de ${formatMoney(compensation.commission_base)}`} />
        <MetricCard label="Total" value={formatMoney(compensation.total_amount)} detail={`Status: ${compensation.status}`} />
      </section>
      <section className="table-panel">
        <div className="table-panel-heading">
          <div><h2>Contratos considerados</h2><span className="list-count">{itemRows.length} itens na base</span></div>
          <StatusBadge tone={statusTone(compensation.status)}>{compensation.status}</StatusBadge>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Cliente e servico</th><th>Origem</th><th>Base</th><th>Percentual</th><th>Comissao</th></tr></thead>
            <tbody>
              {itemRows.length ? itemRows.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td>{item.source_type === "received_entry" ? "Recebimento" : "Contrato previsto"}</td>
                  <td>{formatMoney(item.base_amount)}</td>
                  <td>{Number(item.rate_percent).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%</td>
                  <td>{formatMoney(item.commission_amount)}</td>
                </tr>
              )) : <tr><td colSpan={5}>Este prestador nao possui comissao sobre contratos nesta competencia.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="form-panel page-form-panel">
        <h2>Ajustes do fechamento</h2>
        <form className="form-stack" action="/api/pessoas/colaboradores" method="post">
          <input type="hidden" name="action" value="adjust" />
          <input type="hidden" name="compensationId" value={compensation.id} />
          <div className="form-grid">
            <label>
              Acrescimo ou desconto
              <input name="adjustments" inputMode="decimal" defaultValue={Number(compensation.adjustments).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} disabled={compensation.status !== "rascunho"} />
            </label>
            <label>
              Observacao do ajuste
              <input name="notes" defaultValue={compensation.notes || ""} disabled={compensation.status !== "rascunho"} />
            </label>
          </div>
          <div className="page-form-actions">
            <button className="primary-button" type="submit" disabled={compensation.status !== "rascunho"}>Salvar ajuste</button>
          </div>
        </form>
      </section>
    </>
  );
}
