import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type VendasPageProps = {
  searchParams?: Promise<{ status?: string }>;
};

type ClientRow = {
  id: string;
  legal_name: string;
};

type ProductRow = {
  id: string;
  name: string;
  sale_price: number | string;
  current_stock: number | string;
  unit: string;
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
  created: { kind: "success", text: "Venda registrada, estoque baixado e entrada financeira gerada." },
  invalid: { kind: "error", text: "Revise produto, quantidade e valor da venda." },
  stock_insufficient: { kind: "error", text: "Estoque insuficiente para concluir a venda." },
  error: { kind: "error", text: "Nao foi possivel registrar a venda agora." },
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

function formatPriceInput(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function VendasPage({ searchParams }: VendasPageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id,legal_name")
    .eq("status", "ativo")
    .order("legal_name", { ascending: true });
  const { data: products } = await supabase
    .from("products")
    .select("id,name,sale_price,current_stock,unit")
    .eq("active", true)
    .gt("current_stock", 0)
    .order("name", { ascending: true });
  const { data: sales } = await supabase
    .from("sales")
    .select("id,sale_date,description,net_amount,status,clients(legal_name)")
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);
  const allClients = (clients || []) as ClientRow[];
  const allProducts = (products || []) as ProductRow[];
  const allSales = (sales || []) as SaleRow[];
  const message = params?.status ? statusMessages[params.status] : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        area="Operacao / Vendas"
        title="Vendas"
        description="Venda direta com baixa de estoque e geracao de contas a receber."
        action={<a className="primary-button button-link" href="/operacao/estoque">Ver estoque</a>}
      />
      {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
      <div className="two-columns">
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
        <section className="form-panel">
          <h2>Nova venda</h2>
          <form className="form-stack" action="/api/operacao/vendas" method="post">
            <label>
              Cliente
              <select name="clientId" defaultValue="">
                <option value="">Consumidor final</option>
                {allClients.map((client) => (
                  <option key={client.id} value={client.id}>{client.legal_name}</option>
                ))}
              </select>
            </label>
            <label>
              Produto
              <select name="productId" required defaultValue="">
                <option value="" disabled>Selecione um produto com estoque</option>
                {allProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} · {Number(product.current_stock).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {product.unit} · {formatMoney(product.sale_price)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Descricao da venda
              <input name="description" placeholder="Ex.: Venda de armacao e lentes / equipamento" />
            </label>
            <div className="form-grid">
              <label>
                Quantidade
                <input name="quantity" inputMode="decimal" placeholder="1" required />
              </label>
              <label>
                Valor unitario
                <input
                  name="unitPrice"
                  inputMode="decimal"
                  placeholder={allProducts[0] ? formatPriceInput(allProducts[0].sale_price) : "0,00"}
                  required
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Desconto
                <input name="discountAmount" inputMode="decimal" placeholder="0,00" />
              </label>
              <label>
                Data da venda
                <input name="saleDate" type="date" defaultValue={today} required />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Vencimento
                <input name="dueDate" type="date" defaultValue={today} />
              </label>
              <label>
                Status
                <select name="status" defaultValue="faturada">
                  <option value="faturada">Faturada</option>
                  <option value="recebida">Recebida</option>
                  <option value="aberta">Aberta</option>
                </select>
              </label>
            </div>
            <label>
              Forma de pagamento
              <input name="paymentMethod" placeholder="Pix, cartao, boleto, dinheiro..." />
            </label>
            <label>
              Observacoes
              <textarea name="notes" placeholder="Entrega, condicoes comerciais ou observacoes internas" />
            </label>
            <button className="primary-button" type="submit" disabled={!allProducts.length}>Registrar venda</button>
          </form>
        </section>
      </div>
    </>
  );
}
