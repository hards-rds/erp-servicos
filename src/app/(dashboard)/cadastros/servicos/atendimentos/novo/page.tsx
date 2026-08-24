import { PageHeader } from "@/components/layout/page-header";
import { ServiceRecordForm } from "@/components/services/service-forms";
import { serviceTypeOptions, type ServiceSegment } from "@/domains/services/catalog";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function NovoAtendimentoPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle() : { data: null };
  const [{ data: company }, { data: clients }, { data: sellers }] = profile?.company_id ? await Promise.all([
    supabase.from("companies").select("service_segment").eq("id", profile.company_id).maybeSingle(),
    supabase.from("clients").select("id,legal_name").eq("company_id", profile.company_id).eq("status", "ativo").order("legal_name"),
    supabase.from("commission_sellers").select("id,name,email").eq("company_id", profile.company_id).eq("active", true).order("name")
  ]) : [{ data: null }, { data: [] }, { data: [] }];
  const segment = (company?.service_segment || "tecnologia") as ServiceSegment;
  return (
    <>
      <PageHeader area="Cadastros / Servicos / Atendimentos / Novo" title="Novo atendimento" description="Registre um servico executado para o cliente." action={<a className="ghost-button button-link" href="/cadastros/servicos?view=atendimentos">Voltar para atendimentos</a>} />
      <section className="form-panel page-form-panel"><ServiceRecordForm clients={clients || []} sellers={sellers || []} segment={segment} typeOptions={serviceTypeOptions[segment] || serviceTypeOptions.tecnologia} /></section>
    </>
  );
}
