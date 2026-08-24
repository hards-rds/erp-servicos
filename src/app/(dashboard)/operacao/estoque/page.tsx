import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type EstoquePageProps = {
  searchParams?: Promise<{ status?: string }>;
};

type ProductRow = {
  id: string;
  sku: string | null;
  name: string;
  category: string | null;
  unit: string;
  cost_price: number | string;
  sale_price: number | string;
  current_stock: number | string;
  min_stock: number | string;
  active: boolean;
};

type MovementRow = {
  id: string;
  movement_date: string;
  type: string;
  quantity: number | string;
  reason: string | null;
  products: { name: string; unit: string } | { name: string; unit: string }[] | null;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  product_created: { kind: "success", text: "Produto cadastrado no estoque." },
  movement_created: { kind: "success", text: "Movimentacao de estoque registrada." },
  product_invalid: { kind: "error", text: "Revise nome, precos e estoque inicial do produto." },
  movement_invalid: { kind: "error", text: "Revise produto, tipo e quantidade da movimentacao." },
  stock_negative: { kind: "error", text: "A movimentacao deixaria o estoque negativo." },
  duplicate: { kind: "error", text: "Ja existe um produto com esse SKU." },
  product_error: { kind: "error", text: "Nao foi possivel cadastrar o produto agora." },
  movement_error: { kind: "error", text: "Nao foi possivel registrar a movimentacao agora." },
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." }
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatQuantity(value: number | string, unit: string) {
  return `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${unit}`;
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function getProduct(movement: MovementRow) {
  return Array.isArray(movement.products) ? movement.products[0] : movement.products;
}

function getStockTone(product: ProductRow) {
  if (!product.active) return "neutral" as const;
  if (Number(product.current_stock) <= Number(product.min_stock)) return "warning" as const;
  return "success" as const;
}

export default async function EstoquePage({ searchParams }: EstoquePageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };
  const [{ data: products }, { data: movements }] = profile?.company_id
    ? await Promise.all([
      supabase
        .from("products")
        .select("id,sku,name,category,unit,cost_price,sale_price,current_stock,min_stock,active")
        .eq("company_id", profile.company_id)
        .order("name", { ascending: true })
        .limit(100),
      supabase
        .from("stock_movements")
        .select("id,movement_date,type,quantity,reason,products(name,unit)")
        .eq("company_id", profile.company_id)
        .order("movement_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50)
    ])
    : [{ data: [] }, { data: [] }];
  const allProducts = (products || []) as ProductRow[];
  const allMovements = (movements || []) as MovementRow[];
  const message = params?.status ? statusMessages[params.status] : null;

  return (
    <>
      <PageHeader
        area="Operacao / Estoque"
        title="Estoque"
        description="Produtos, saldos e movimentacoes para qualquer segmento."
        action={(
          <div className="page-actions">
            <a className="ghost-button button-link" href="/operacao/estoque/movimentacoes/nova">Movimentar estoque</a>
            <a className="primary-button button-link" href="/operacao/estoque/produtos/novo">Novo produto</a>
          </div>
        )}
      />
      {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
      <section className="table-panel">
          <h2>Produtos</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Categoria</th>
                  <th>Venda</th>
                  <th>Estoque</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {allProducts.length ? allProducts.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <strong>{product.name}</strong>
                      {product.sku ? <div className="muted">SKU {product.sku}</div> : null}
                    </td>
                    <td>{product.category || "-"}</td>
                    <td>{formatMoney(product.sale_price)}</td>
                    <td>{formatQuantity(product.current_stock, product.unit)}</td>
                    <td><StatusBadge tone={getStockTone(product)}>{product.active ? "ativo" : "inativo"}</StatusBadge></td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5}>Nenhum produto cadastrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
      </section>
      <section className="table-panel">
          <h2>Ultimas movimentacoes</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Produto</th>
                  <th>Tipo</th>
                  <th>Qtd.</th>
                </tr>
              </thead>
              <tbody>
                {allMovements.length ? allMovements.map((movement) => {
                  const product = getProduct(movement);
                  return (
                    <tr key={movement.id}>
                      <td>{formatDate(movement.movement_date)}</td>
                      <td>
                        {product?.name || "-"}
                        {movement.reason ? <div className="muted">{movement.reason}</div> : null}
                      </td>
                      <td><StatusBadge tone={movement.type === "entrada" ? "success" : "warning"}>{movement.type}</StatusBadge></td>
                      <td>{formatQuantity(movement.quantity, product?.unit || "un")}</td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={4}>Nenhuma movimentacao registrada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
      </section>
    </>
  );
}
