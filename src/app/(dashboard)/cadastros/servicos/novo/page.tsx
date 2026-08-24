import { PageHeader } from "@/components/layout/page-header";
import { CatalogServiceForm } from "@/components/services/service-forms";
import { serviceTypeOptions, type ServiceSegment } from "@/domains/services/catalog";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function NovoServicoPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle() : { data: null };
  const { data: company } = profile?.company_id ? await supabase.from("companies").select("service_segment").eq("id", profile.company_id).maybeSingle() : { data: null };
  const segment = (company?.service_segment || "tecnologia") as ServiceSegment;
  return <><PageHeader area="Cadastros / Servicos / Novo" title="Novo servico" description="Cadastre um servico pronto para reutilizar em vendas." action={<a className="ghost-button button-link" href="/cadastros/servicos?view=catalogo">Voltar para servicos</a>} /><section className="form-panel page-form-panel"><CatalogServiceForm typeOptions={serviceTypeOptions[segment] || serviceTypeOptions.tecnologia} /></section></>;
}
