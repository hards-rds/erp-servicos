import { PageHeader } from "@/components/layout/page-header";
import { DeleteSaleButton } from "@/components/sales/delete-sale-button";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { CompetenceFilter } from "@/components/ui/competence-filter";
import { competenceDateRange, resolveCompetence } from "@/lib/dates/competence";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type VendasPageProps = {
  searchParams?: Promise<{ status?: string; competence?: string }>;
};

type SaleRow = {
  id: string;
  sale_date: string;
  description: string;
  net_amount: number | string;
  status: string;
  clients: { legal_name: string } | { legal_name: string }[] | null;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  created: { kind: "success", text: "Venda registrada e entrada financeira gerada." },
  invalid: { kind: "error", text: "Revise o item, a quantidade e o valor da venda." },
  stock_insufficient: { kind: "error", text: "Estoque insuficiente para concluir a venda." },
  error: { kind: "error", text: "Nao foi possivel registrar a venda agora." },
  commission_rule_missing: { kind: "error", text: "Configure o percentual deste vendedor para o item antes de concluir a venda." },
  commission_error: { kind: "error", text: "A venda foi registrada, mas nao foi possivel gerar a comissao." },
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." },
  deleted: { kind: "success", text: "Venda excluida. O financeiro, a comissao e o estoque foram ajustados." },
  delete_invalid: { kind: "error", text: "A venda informada e invalida." },
  delete_not_found: { kind: "error", text: "A venda nao foi encontrada na empresa ativa." },
  delete_forbidden: { kind: "error", text: "Seu usuario nao tem permissao para excluir vendas e seus lancamentos financeiros." },
  delete_nfse: { kind: "error", text: "Esta venda possui uma NFS-e com efeito fiscal. Cancele ou trate o documento antes de excluir a venda." },
  delete_charge: { kind: "error", text: "Esta venda possui uma cobranca bancaria ativa. Cancele a cobranca antes de excluir a venda." },
  delete_reconciliation: { kind: "error", text: "Esta venda possui conciliacao bancaria e deve permanecer no historico." },
  delete_commission_paid: { kind: "error", text: "A comissao desta venda ja foi paga ou conciliada e impede a exclusao." },
  delete_error: { kind: "error", text: "Nao foi possivel excluir a venda. Nenhuma alteracao parcial foi mantida." }
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function getClientName(sale: SaleRow) {
  const client = Array.isArray(sale.clients) ? sale.clients[0] : sale.clients;
  return client?.legal_name || "Consumidor final";
}

export default async function VendasPage({ searchParams }: VendasPageProps) {
  const params = await searchParams;
  const competence = resolveCompetence(params?.competence);
  const range = competenceDateRange(competence);
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };
  const companyId = profile?.company_id;

  const { data: sales } = companyId
    ? await supabase.from("sales").select("id,sale_date,description,net_amount,status,clients(legal_name)").eq("company_id", companyId).gte("sale_date", range.start).lt("sale_date", range.next).order("sale_date", { ascending: false }).order("created_at", { ascending: false }).limit(500)
    : { data: [] };
  const allSales = (sales || []) as SaleRow[];
  const message = params?.status ? statusMessages[params.status] : null;
  return (
    <>
      <PageHeader
        area="Operacao / Vendas"
        title="Vendas"
        description="Venda de produtos, servicos cadastrados ou atendimentos avulsos."
        action={<a className="primary-button button-link" href="/operacao/vendas/nova">Nova venda</a>}
      />
      <CompetenceFilter value={competence} pathname="/operacao/vendas" />
      {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
      <section className="table-panel">
          <h2>Ultimas vendas</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Venda</th>
                  <th>Cliente</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {allSales.length ? allSales.map((sale) => (
                  <tr key={sale.id}>
                    <td>{formatDate(sale.sale_date)}</td>
                    <td>{sale.description}</td>
                    <td>{getClientName(sale)}</td>
                    <td>{formatMoney(sale.net_amount)}</td>
                    <td><StatusBadge tone={sale.status === "recebida" ? "success" : "warning"}>{sale.status}</StatusBadge></td>
                    <td>
                      <RowActionsMenu label={`Acoes da venda ${sale.description}`}>
                        <DeleteSaleButton saleId={sale.id} description={sale.description} />
                      </RowActionsMenu>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6}>Nenhuma venda registrada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
      </section>
    </>
  );
}
