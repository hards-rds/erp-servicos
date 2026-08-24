import { SellerRuleForm } from "@/components/finance/seller-rule-form";
import { PageHeader } from "@/components/layout/page-header";
import { serviceTypeOptions, type ServiceSegment } from "@/domains/services/catalog";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function NovoPercentualPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle() : { data: null };
  const [{ data: sellers }, { data: products }, { data: services }, { data: company }] = profile?.company_id ? await Promise.all([
    supabase.from("commission_sellers").select("id,name").eq("company_id", profile.company_id).eq("active", true).order("name"),
    supabase.from("products").select("id,name").eq("company_id", profile.company_id).eq("active", true).order("name"),
    supabase.from("service_catalog").select("id,name").eq("company_id", profile.company_id).eq("active", true).order("name"),
    supabase.from("companies").select("service_segment").eq("id", profile.company_id).maybeSingle()
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: null }];
  const segment = (company?.service_segment || "tecnologia") as ServiceSegment;
  return (
    <>
      <PageHeader area="Financeiro / Comissoes / Percentuais / Novo" title="Novo percentual" description="Defina a comissao do vendedor por produto, venda ou tipo de servico." action={<a className="ghost-button button-link" href="/financeiro/comissoes/vendedores">Voltar para vendedores</a>} />
      <section className="form-panel page-form-panel">
        <SellerRuleForm sellers={sellers || []} products={products || []} catalogServices={services || []} serviceTypes={serviceTypeOptions[segment] || serviceTypeOptions.tecnologia} />
      </section>
    </>
  );
}
