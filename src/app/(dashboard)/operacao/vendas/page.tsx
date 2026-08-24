import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type VendasPageProps = {
  searchParams?: Promise<{ status?: string }>;
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
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." }
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
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };
  const companyId = profile?.company_id;

  const { data: sales } = companyId
    ? await supabase.from("sales").select("id,sale_date,description,net_amount,status,clients(legal_name)").eq("company_id", companyId).order("sale_date", { ascending: false }).order("created_at", { ascending: false }).limit(50)
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
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5}>Nenhuma venda registrada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
      </section>
    </>
  );
}
