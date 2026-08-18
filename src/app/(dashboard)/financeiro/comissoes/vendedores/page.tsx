import { SellerRuleForm } from "@/components/finance/seller-rule-form";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { serviceTypeOptions, type ServiceSegment } from "@/domains/services/catalog";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Seller = { id: string; name: string; email: string | null; phone: string | null; active: boolean };
type Profile = { id: string; name: string | null; email: string };
type Product = { id: string; name: string };
type Rule = {
  id: string;
  commission_seller_id: string;
  source_type: "venda" | "servico";
  item_key: string;
  service_type: string | null;
  rate_percent: number | string;
  seller: { name: string } | { name: string }[] | null;
  product: { name: string } | { name: string }[] | null;
};

const messages: Record<string, { kind: "success" | "error"; text: string }> = {
  seller_created: { kind: "success", text: "Vendedor cadastrado com sucesso." },
  seller_updated: { kind: "success", text: "Status do vendedor atualizado." },
  rule_saved: { kind: "success", text: "Percentual de comissao salvo." },
  rule_deleted: { kind: "success", text: "Regra de comissao excluida." },
  duplicate_seller: { kind: "error", text: "Este usuario ja esta vinculado a um vendedor." },
  invalid_profile: { kind: "error", text: "O usuario selecionado nao pertence a empresa ativa." },
  invalid_seller: { kind: "error", text: "Revise os dados do vendedor." },
  invalid_rule: { kind: "error", text: "Revise a origem e o percentual da comissao." },
  invalid_item: { kind: "error", text: "O produto ou tipo de servico informado nao e valido." },
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." },
  invalid: { kind: "error", text: "Acao invalida." },
  error: { kind: "error", text: "Nao foi possivel salvar a configuracao agora." }
};

function single<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function VendedoresPage({ searchParams }: { searchParams?: Promise<{ status?: string }> }) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };

  let sellers: Seller[] = [];
  let profiles: Profile[] = [];
  let products: Product[] = [];
  let rules: Rule[] = [];
  let segment: ServiceSegment = "tecnologia";

  if (profile?.company_id) {
    const [{ data: sellerData }, { data: profileData }, { data: productData }, { data: ruleData }, { data: company }] = await Promise.all([
      supabase.from("commission_sellers").select("id,name,email,phone,active").eq("company_id", profile.company_id).order("active", { ascending: false }).order("name"),
      supabase.from("profiles").select("id,name,email").eq("company_id", profile.company_id).eq("active", true).order("name"),
      supabase.from("products").select("id,name").eq("company_id", profile.company_id).eq("active", true).order("name"),
      supabase.from("seller_commission_rules").select("id,commission_seller_id,source_type,item_key,service_type,rate_percent,seller:commission_sellers!seller_commission_rules_commission_seller_id_fkey(name),product:products(name)").eq("company_id", profile.company_id).eq("active", true).order("source_type").order("item_key"),
      supabase.from("companies").select("service_segment").eq("id", profile.company_id).maybeSingle()
    ]);
    sellers = (sellerData || []) as Seller[];
    profiles = (profileData || []) as Profile[];
    products = (productData || []) as Product[];
    rules = (ruleData || []) as Rule[];
    segment = (company?.service_segment || "tecnologia") as ServiceSegment;
  }

  const message = params?.status ? messages[params.status] : null;
  const activeSellers = sellers.filter((seller) => seller.active);
  const serviceLabels = new Map((serviceTypeOptions[segment] || serviceTypeOptions.tecnologia).map((item) => [item.value, item.label]));

  return (
    <>
      <PageHeader
        area="Financeiro / Comissoes / Vendedores"
        title="Vendedores e percentuais"
        description="Cadastre vendedores e defina comissoes para vendas e servicos."
        action={<a className="ghost-button button-link" href="/financeiro/comissoes">Voltar para comissoes</a>}
      />
      {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
      <div className="two-columns">
        <section className="table-panel">
          <h2>Vendedores cadastrados</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Vendedor</th><th>Contato</th><th>Status</th><th>Acoes</th></tr></thead>
              <tbody>
                {sellers.length ? sellers.map((seller) => (
                  <tr key={seller.id}>
                    <td><strong>{seller.name}</strong></td>
                    <td>{seller.email || seller.phone || "-"}</td>
                    <td><StatusBadge tone={seller.active ? "success" : "neutral"}>{seller.active ? "ativo" : "inativo"}</StatusBadge></td>
                    <td>
                      <form action="/api/financeiro/vendedores" method="post">
                        <input type="hidden" name="action" value="toggle_seller" />
                        <input type="hidden" name="sellerId" value={seller.id} />
                        <input type="hidden" name="active" value={seller.active ? "false" : "true"} />
                        <button className="ghost-button compact-button" type="submit">{seller.active ? "Desativar" : "Ativar"}</button>
                      </form>
                    </td>
                  </tr>
                )) : <tr><td colSpan={4}>Nenhum vendedor cadastrado.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <section className="form-panel">
          <h2>Novo vendedor</h2>
          <form className="form-stack" action="/api/financeiro/vendedores" method="post">
            <input type="hidden" name="action" value="create_seller" />
            <label>Nome<input name="name" required /></label>
            <div className="form-grid">
              <label>E-mail<input name="email" type="email" /></label>
              <label>Telefone<input name="phone" /></label>
            </div>
            <label>
              Usuario vinculado
              <select name="profileId" defaultValue="">
                <option value="">Sem acesso ao sistema</option>
                {profiles.map((item) => <option key={item.id} value={item.id}>{item.name || item.email}</option>)}
              </select>
            </label>
            <label>Observacoes<textarea name="notes" /></label>
            <button className="primary-button" type="submit">Cadastrar vendedor</button>
          </form>
        </section>
      </div>
      <div className="two-columns">
        <section className="table-panel">
          <h2>Percentuais configurados</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Vendedor</th><th>Origem</th><th>Item</th><th>Percentual</th><th>Acoes</th></tr></thead>
              <tbody>
                {rules.length ? rules.map((rule) => {
                  const seller = single(rule.seller);
                  const product = single(rule.product);
                  const item = rule.item_key === "*"
                    ? "Todos (padrao)"
                    : rule.source_type === "venda"
                      ? product?.name || "Produto"
                      : serviceLabels.get(rule.service_type || "") || rule.service_type;
                  return (
                    <tr key={rule.id}>
                      <td>{seller?.name || "Vendedor"}</td>
                      <td>{rule.source_type}</td>
                      <td>{item}</td>
                      <td><strong>{Number(rule.rate_percent).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%</strong></td>
                      <td>
                        <form action="/api/financeiro/vendedores" method="post">
                          <input type="hidden" name="action" value="delete_rule" />
                          <input type="hidden" name="ruleId" value={rule.id} />
                          <button className="ghost-button compact-button" type="submit">Excluir</button>
                        </form>
                      </td>
                    </tr>
                  );
                }) : <tr><td colSpan={5}>Nenhum percentual configurado.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <section className="form-panel">
          <h2>Novo percentual</h2>
          <SellerRuleForm
            sellers={activeSellers.map((seller) => ({ id: seller.id, name: seller.name }))}
            products={products}
            serviceTypes={serviceTypeOptions[segment] || serviceTypeOptions.tecnologia}
          />
        </section>
      </div>
    </>
  );
}
