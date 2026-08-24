import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ServiceRecordForm, type ServiceFormValue } from "@/components/services/service-forms";
import { serviceTypeOptions, type ServiceSegment } from "@/domains/services/catalog";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditarAtendimentoPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle() : { data: null };
  if (!profile?.company_id) notFound();
  const [{ data: company }, { data: clients }, { data: sellers }, { data: service }] = await Promise.all([
    supabase.from("companies").select("service_segment").eq("id", profile.company_id).maybeSingle(),
    supabase.from("clients").select("id,legal_name").eq("company_id", profile.company_id).eq("status", "ativo").order("legal_name"),
    supabase.from("commission_sellers").select("id,name,email").eq("company_id", profile.company_id).eq("active", true).order("name"),
    supabase.from("service_records").select("id,client_id,service_description,service_type,amount,service_date,due_date,status,fiscal_service_data,notes,commissions(commission_seller_id,due_date,status)").eq("company_id", profile.company_id).eq("id", id).maybeSingle()
  ]);
  if (!service) notFound();
  const segment = (company?.service_segment || "tecnologia") as ServiceSegment;
  return (
    <>
      <PageHeader area="Cadastros / Servicos / Atendimentos / Editar" title="Evoluir atendimento" description={service.service_description} action={<a className="ghost-button button-link" href="/cadastros/servicos?view=atendimentos">Voltar para atendimentos</a>} />
      <section className="form-panel page-form-panel"><ServiceRecordForm clients={clients || []} sellers={sellers || []} segment={segment} typeOptions={serviceTypeOptions[segment] || serviceTypeOptions.tecnologia} service={service as ServiceFormValue} /></section>
    </>
  );
}
