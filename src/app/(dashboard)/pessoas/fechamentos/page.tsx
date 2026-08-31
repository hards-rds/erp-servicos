import { CompensationActions } from "@/components/people/compensation-actions";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CompensationRow = {
  id: string;
  competence: string;
  due_date: string;
  fixed_amount: number | string;
  cost_allowance_amount: number | string;
  commission_base: number | string;
  commission_rate: number | string;
  commission_amount: number | string;
  adjustments: number | string;
  total_amount: number | string;
  status: string;
  contractor: { legal_name: string; trade_name: string | null; role_title: string } | Array<{ legal_name: string; trade_name: string | null; role_title: string }> | null;
};

const messages: Record<string, { kind: "success" | "error"; text: string }> = {
  generated: { kind: "success", text: "Fechamentos calculados. Confira os contratos antes de aprovar." },
  locked: { kind: "success", text: "Os fechamentos desta competencia ja estavam calculados e aprovados." },
  empty: { kind: "error", text: "Nao ha prestadores ativos para a competencia informada." },
  cancelled: { kind: "success", text: "Fechamento e conta a pagar em aberto foram cancelados." },
  generate_error: { kind: "error", text: "Nao foi possivel calcular todos os fechamentos." },
  invalid: { kind: "error", text: "Informe uma competencia valida." },
  forbidden: { kind: "error", text: "Seu usuario nao possui permissao para esta operacao." }
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function contractorName(row: CompensationRow) {
  const contractor = Array.isArray(row.contractor) ? row.contractor[0] : row.contractor;
  return contractor?.trade_name || contractor?.legal_name || "Prestador PJ";
}

function statusTone(status: string) {
  if (status === "pago") return "success" as const;
  if (["rascunho", "aprovado"].includes(status)) return "warning" as const;
  return "neutral" as const;
}

export default async function FechamentosPage({ searchParams }: { searchParams?: Promise<{ status?: string; competence?: string; generated?: string }> }) {
  const params = await searchParams;
  const competence = /^\d{4}-\d{2}$/.test(params?.competence || "") ? params!.competence! : new Date().toISOString().slice(0, 7);
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle() : { data: null };
  const { data } = profile?.company_id
    ? await supabase.from("contractor_compensations")
      .select("id,competence,due_date,fixed_amount,cost_allowance_amount,commission_base,commission_rate,commission_amount,adjustments,total_amount,status,contractor:contractors(legal_name,trade_name,role_title)")
      .eq("company_id", profile.company_id)
      .eq("competence", competence)
      .order("created_at")
    : { data: [] };
  const rows = (data || []) as CompensationRow[];
  const valid = rows.filter((row) => row.status !== "cancelado");
  const drafts = rows.filter((row) => row.status === "rascunho");
  const approved = rows.filter((row) => row.status === "aprovado");
  const paid = rows.filter((row) => row.status === "pago");
  const message = params?.status ? messages[params.status] : null;

  return (
    <>
      <PageHeader
        area="Pessoas / Fechamentos"
        title="Fechamentos de prestadores"
        description="Calcule a remuneracao PJ, confira a memoria por contrato e gere a conta a pagar."
        action={<Link className="ghost-button button-link" href="/pessoas/colaboradores">Prestadores PJ</Link>}
      />
      {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
      <section className="form-panel">
        <form className="support-sync-grid form-grid" action="/api/pessoas/colaboradores" method="post">
          <input type="hidden" name="action" value="generate_all" />
          <label>
            Competencia
            <input name="competence" type="month" defaultValue={competence} required />
          </label>
          <div>
            <strong>Calculo mensal</strong>
            <p className="muted">Recalcula apenas rascunhos; aprovados permanecem congelados.</p>
          </div>
          <button className="primary-button" type="submit">Calcular competencia</button>
        </form>
      </section>
      <section className="metrics">
        <MetricCard label="Total da competencia" value={formatMoney(valid.reduce((sum, row) => sum + Number(row.total_amount), 0))} detail={`${valid.length} prestadores`} />
        <MetricCard label="Para conferencia" value={formatMoney(drafts.reduce((sum, row) => sum + Number(row.total_amount), 0))} detail={`${drafts.length} rascunhos`} />
        <MetricCard label="Contas a pagar" value={formatMoney(approved.reduce((sum, row) => sum + Number(row.total_amount), 0))} detail={`${approved.length} aprovados`} />
        <MetricCard label="Pagos" value={formatMoney(paid.reduce((sum, row) => sum + Number(row.total_amount), 0))} detail={`${paid.length} baixas`} />
      </section>
      <section className="table-panel">
        <div className="table-panel-heading"><div><h2>Competencia {competence}</h2><span className="list-count">{rows.length} fechamentos</span></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th data-sort-default="ascending">Prestador</th><th>Fixo</th><th>Ajuda</th><th>Base comissao</th><th>Percentual</th><th>Comissao</th><th>Ajustes</th><th>Total</th><th>Vencimento</th><th>Status</th><th>Acoes</th></tr></thead>
            <tbody>
              {rows.length ? rows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{contractorName(row)}</strong></td>
                  <td>{formatMoney(row.fixed_amount)}</td>
                  <td>{formatMoney(row.cost_allowance_amount)}</td>
                  <td>{formatMoney(row.commission_base)}</td>
                  <td>{Number(row.commission_rate).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%</td>
                  <td>{formatMoney(row.commission_amount)}</td>
                  <td>{formatMoney(row.adjustments)}</td>
                  <td><strong>{formatMoney(row.total_amount)}</strong></td>
                  <td>{formatDate(row.due_date)}</td>
                  <td><StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge></td>
                  <td><CompensationActions id={row.id} status={row.status} /></td>
                </tr>
              )) : <tr><td colSpan={11}>Nenhum fechamento calculado nesta competencia.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
import Link from "next/link";
