import { PageHeader } from "@/components/layout/page-header";
import { SaleForm } from "@/components/sales/sale-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function NovaVendaPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };
  const companyId = profile?.company_id;
  const [{ data: clients }, { data: products }, { data: services }, { data: sellers }] = companyId
    ? await Promise.all([
      supabase.from("clients").select("id,legal_name").eq("company_id", companyId).eq("status", "ativo").order("legal_name"),
      supabase.from("products").select("id,name,sale_price,current_stock,unit").eq("company_id", companyId).eq("active", true).gt("current_stock", 0).order("name"),
      supabase.from("service_catalog").select("id,name,description,sale_price").eq("company_id", companyId).eq("active", true).order("name"),
      supabase.from("commission_sellers").select("id,name,email").eq("company_id", companyId).eq("active", true).order("name")
    ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  return (
    <>
      <PageHeader
        area="Operacao / Vendas / Nova"
        title="Nova venda"
        description="Registre produtos, servicos cadastrados ou um servico avulso."
        action={<a className="ghost-button button-link" href="/operacao/vendas">Voltar para vendas</a>}
      />
      <section className="form-panel page-form-panel">
        <SaleForm
          clients={(clients || []).map((client) => ({ id: client.id, name: client.legal_name }))}
          products={(products || []).map((product) => ({ id: product.id, name: product.name, price: Number(product.sale_price), stock: Number(product.current_stock), unit: product.unit }))}
          catalogServices={(services || []).map((service) => ({ id: service.id, name: service.name, description: service.description, price: Number(service.sale_price) }))}
          sellers={(sellers || []).map((seller) => ({ id: seller.id, name: seller.name || seller.email }))}
        />
      </section>
    </>
  );
}
