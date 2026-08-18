import { CommissionActions } from "@/components/finance/commission-actions";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SellerRow = { id: string; name: string | null; email: string };
type CommissionRow = {
  id: string;
  description: string;
  source_type: string;
  reference_date: string;
  due_date: string;
  base_amount: number | string;
  rate_percent: number | string;
  commission_amount: number | string;
  status: string;
  paid_at: string | null;
  payment_method: string | null;
  seller: { name: string | null; email: string } | Array<{ name: string | null; email: string }> | null;
};

const messages: Record<string, { kind: "success" | "error"; text: string }> = {
  created: { kind: "success", text: "Comissao cadastrada com sucesso." },
  approved: { kind: "success", text: "Comissao aprovada e conta a pagar gerada." },
  paid: { kind: "success", text: "Pagamento da comissao e baixa financeira registrados." },
  canceled: { kind: "success", text: "Comissao cancelada." },
  invalid: { kind: "error", text: "Revise vendedor, valores, percentual e datas." },
  invalid_seller: { kind: "error", text: "O vendedor informado nao pertence a empresa ativa." },
  invalid_payment: { kind: "error", text: "Informe a data e a forma de pagamento." },
  invalid_transition: { kind: "error", text: "Esta comissao nao permite a acao solicitada." },
  not_found: { kind: "error", text: "Comissao nao encontrada na empresa ativa." },
  payable_error: { kind: "error", text: "Nao foi possivel sincronizar a comissao com contas a pagar." },
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." },
  error: { kind: "error", text: "Nao foi possivel atualizar a comissao agora." }
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function getSeller(commission: CommissionRow) {
  const seller = Array.isArray(commission.seller) ? commission.seller[0] : commission.seller;
  return seller?.name || seller?.email || "Vendedor";
}

function getTone(status: string) {
  if (status === "paga") return "success" as const;
  if (["pendente", "aprovada"].includes(status)) return "warning" as const;
  return "neutral" as const;
}

export default async function ComissoesPage({ searchParams }: { searchParams?: Promise<{ status?: string }> }) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };

  let sellers: SellerRow[] = [];
  let commissions: CommissionRow[] = [];
  if (profile?.company_id) {
    const [{ data: sellerData }, { data: commissionData }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,name,email")
        .eq("company_id", profile.company_id)
        .eq("active", true)
        .order("name"),
      supabase
        .from("commissions")
        .select("id,description,source_type,reference_date,due_date,base_amount,rate_percent,commission_amount,status,paid_at,payment_method,seller:profiles!commissions_seller_id_fkey(name,email)")
        .eq("company_id", profile.company_id)
        .order("reference_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200)
    ]);
    sellers = (sellerData || []) as SellerRow[];
    commissions = (commissionData || []) as CommissionRow[];
  }

  const active = commissions.filter((item) => item.status !== "cancelada");
  const pending = commissions.filter((item) => item.status === "pendente");
  const approved = commissions.filter((item) => item.status === "aprovada");
  const paid = commissions.filter((item) => item.status === "paga");
  const message = params?.status ? messages[params.status] : !profile?.company_id ? messages.profile_error : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        area="Financeiro / Comissoes"
        title="Comissoes de vendedores"
        description="Controle comissoes de vendas e servicos, aprovacao e pagamento por vendedor."
      />
      {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
      <section className="metrics">
        <MetricCard label="Total ativo" value={formatMoney(active.reduce((sum, item) => sum + Number(item.commission_amount), 0))} detail={`${active.length} comissoes`} />
        <MetricCard label="Pendentes" value={formatMoney(pending.reduce((sum, item) => sum + Number(item.commission_amount), 0))} detail={`${pending.length} aguardando aprovacao`} />
        <MetricCard label="Aprovadas" value={formatMoney(approved.reduce((sum, item) => sum + Number(item.commission_amount), 0))} detail={`${approved.length} contas a pagar`} />
        <MetricCard label="Pagas" value={formatMoney(paid.reduce((sum, item) => sum + Number(item.commission_amount), 0))} detail={`${paid.length} pagamentos`} />
      </section>
      <div className="two-columns">
        <section className="table-panel">
          <h2>Comissoes registradas</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>Origem</th>
                  <th>Referencia</th>
                  <th>Base</th>
                  <th>Percentual</th>
                  <th>Comissao</th>
                  <th>Vencimento</th>
                  <th>Status</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {commissions.length ? commissions.map((commission) => (
                  <tr key={commission.id}>
                    <td>{getSeller(commission)}</td>
                    <td>
                      <strong>{commission.description}</strong>
                      <div className="muted">{commission.source_type}</div>
                    </td>
                    <td>{formatDate(commission.reference_date)}</td>
                    <td>{formatMoney(commission.base_amount)}</td>
                    <td>{Number(commission.rate_percent).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%</td>
                    <td><strong>{formatMoney(commission.commission_amount)}</strong></td>
                    <td>
                      {formatDate(commission.due_date)}
                      {commission.paid_at ? <div className="muted">Pago em {formatDate(commission.paid_at)} · {commission.payment_method}</div> : null}
                    </td>
                    <td><StatusBadge tone={getTone(commission.status)}>{commission.status}</StatusBadge></td>
                    <td>
                      <CommissionActions
                        commissionId={commission.id}
                        description={commission.description}
                        amount={commission.commission_amount}
                        status={commission.status}
                      />
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={9}>Nenhuma comissao cadastrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="form-panel">
          <h2>Comissao manual</h2>
          <form className="form-stack" action="/api/financeiro/comissoes" method="post">
            <input type="hidden" name="action" value="create" />
            <label>
              Vendedor
              <select name="sellerId" defaultValue="" required>
                <option value="" disabled>Selecione um vendedor</option>
                {sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name || seller.email}</option>)}
              </select>
            </label>
            <label>
              Descricao
              <input name="description" placeholder="Ex.: Campanha comercial de agosto" required />
            </label>
            <div className="form-grid">
              <label>
                Valor base
                <input name="baseAmount" inputMode="decimal" placeholder="0,00" required />
              </label>
              <label>
                Percentual
                <input name="ratePercent" inputMode="decimal" placeholder="5,00" required />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Data de referencia
                <input name="referenceDate" type="date" defaultValue={today} required />
              </label>
              <label>
                Vencimento
                <input name="dueDate" type="date" defaultValue={today} required />
              </label>
            </div>
            <label>
              Observacao
              <textarea name="notes" placeholder="Motivo ou regra especial desta comissao" />
            </label>
            <button className="primary-button" type="submit" disabled={!sellers.length}>Cadastrar comissao</button>
          </form>
        </section>
      </div>
    </>
  );
}
