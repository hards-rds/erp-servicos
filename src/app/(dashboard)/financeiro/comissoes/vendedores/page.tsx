import { SellerActions } from "@/components/finance/seller-actions";
import { SellerRuleActions } from "@/components/finance/seller-rule-actions";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { serviceTypeOptions, type ServiceSegment } from "@/domains/services/catalog";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Seller = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  profile_id: string | null;
  active: boolean;
};
type Profile = { id: string; name: string | null; email: string };
type Product = { id: string; name: string };
type CatalogService = { id: string; name: string };
type Rule = {
  id: string;
  commission_seller_id: string;
  source_type: "venda" | "servico";
  item_key: string;
  product_id: string | null;
  service_catalog_id: string | null;
  service_type: string | null;
  rate_percent: number | string;
  seller: { name: string } | { name: string }[] | null;
  product: { name: string } | { name: string }[] | null;
  catalog_service: { name: string } | { name: string }[] | null;
};

const messages: Record<string, { kind: "success" | "error"; text: string }> = {
  seller_created: { kind: "success", text: "Vendedor cadastrado com sucesso." },
  seller_updated: { kind: "success", text: "Vendedor atualizado com sucesso." },
  rule_saved: { kind: "success", text: "Percentual de comissao salvo." },
  rule_updated: { kind: "success", text: "Percentual atualizado com sucesso." },
  duplicate_rule: { kind: "error", text: "Ja existe um percentual para este vendedor e item." },
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
  let catalogServices: CatalogService[] = [];
  let rules: Rule[] = [];
  let segment: ServiceSegment = "tecnologia";

  if (profile?.company_id) {
    const [{ data: sellerData }, { data: profileData }, { data: productData }, { data: catalogServiceData }, { data: ruleData }, { data: company }] = await Promise.all([
      supabase.from("commission_sellers").select("id,name,email,phone,notes,profile_id,active").eq("company_id", profile.company_id).order("active", { ascending: false }).order("name"),
      supabase.from("profiles").select("id,name,email").eq("company_id", profile.company_id).order("name"),
      supabase.from("products").select("id,name").eq("company_id", profile.company_id).eq("active", true).order("name"),
      supabase.from("service_catalog").select("id,name").eq("company_id", profile.company_id).eq("active", true).order("name"),
      supabase.from("seller_commission_rules").select("id,commission_seller_id,source_type,item_key,product_id,service_catalog_id,service_type,rate_percent,seller:commission_sellers!seller_commission_rules_commission_seller_id_fkey(name),product:products(name),catalog_service:service_catalog(name)").eq("company_id", profile.company_id).eq("active", true).order("source_type").order("item_key"),
      supabase.from("companies").select("service_segment").eq("id", profile.company_id).maybeSingle()
    ]);
    sellers = (sellerData || []) as Seller[];
    profiles = (profileData || []) as Profile[];
    products = (productData || []) as Product[];
    catalogServices = (catalogServiceData || []) as CatalogService[];
    rules = (ruleData || []) as Rule[];
    segment = (company?.service_segment || "tecnologia") as ServiceSegment;
  }

  const message = params?.status ? messages[params.status] : null;
  const sellerOptions = sellers.map((seller) => ({ id: seller.id, name: seller.name }));
  const profileOptions = profiles.map((item) => ({ id: item.id, name: item.name || item.email }));
  const serviceLabels = new Map((serviceTypeOptions[segment] || serviceTypeOptions.tecnologia).map((item) => [item.value, item.label]));

  return (
    <>
      <PageHeader
        area="Financeiro / Comissoes / Vendedores"
        title="Vendedores e percentuais"
        description="Cadastre vendedores e defina comissoes para vendas e servicos."
        action={(
          <div className="page-actions">
            <a className="ghost-button button-link" href="/financeiro/comissoes/vendedores/percentuais/novo">Novo percentual</a>
            <a className="primary-button button-link" href="/financeiro/comissoes/vendedores/novo">Novo vendedor</a>
          </div>
        )}
      />
      {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
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
                      <SellerActions
                        seller={{
                          id: seller.id,
                          name: seller.name,
                          email: seller.email,
                          phone: seller.phone,
                          notes: seller.notes,
                          profileId: seller.profile_id,
                          active: seller.active
                        }}
                        profiles={profileOptions}
                      />
                    </td>
                  </tr>
                )) : <tr><td colSpan={4}>Nenhum vendedor cadastrado.</td></tr>}
              </tbody>
            </table>
          </div>
      </section>
      <section className="table-panel">
          <h2>Percentuais configurados</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Vendedor</th><th>Origem</th><th>Item</th><th>Percentual</th><th>Acoes</th></tr></thead>
              <tbody>
                {rules.length ? rules.map((rule) => {
                  const seller = single(rule.seller);
                  const product = single(rule.product);
                  const catalogService = single(rule.catalog_service);
                  const item = rule.item_key === "*"
                    ? "Todos (padrao)"
                    : rule.source_type === "venda"
                      ? product?.name || catalogService?.name || "Item de venda"
                      : serviceLabels.get(rule.service_type || "") || rule.service_type;
                  return (
                    <tr key={rule.id}>
                      <td>{seller?.name || "Vendedor"}</td>
                      <td>{rule.source_type}</td>
                      <td>{item}</td>
                      <td><strong>{Number(rule.rate_percent).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%</strong></td>
                      <td>
                        <SellerRuleActions
                          rule={{
                            id: rule.id,
                            sellerId: rule.commission_seller_id,
                            sourceType: rule.source_type,
                            productId: rule.product_id,
                            catalogServiceId: rule.service_catalog_id,
                            serviceType: rule.service_type,
                            ratePercent: rule.rate_percent
                          }}
                          sellers={sellerOptions}
                          products={products}
                          catalogServices={catalogServices}
                          serviceTypes={serviceTypeOptions[segment] || serviceTypeOptions.tecnologia}
                        />
                      </td>
                    </tr>
                  );
                }) : <tr><td colSpan={5}>Nenhum percentual configurado.</td></tr>}
              </tbody>
            </table>
          </div>
      </section>
    </>
  );
}
