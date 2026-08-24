import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ClientForm } from "../../client-form";
import { OpticalPanel, type OpticalRecord } from "../../optical-panel";

type EditarClientePageProps = { params: Promise<{ id: string }> };

export default async function EditarClientePage({ params }: EditarClientePageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };
  if (!profile?.company_id) notFound();

  const [{ data: company }, { data: client }] = await Promise.all([
    supabase.from("companies").select("service_segment").eq("id", profile.company_id).maybeSingle(),
    supabase
      .from("clients")
      .select("id,legal_name,trade_name,document,municipal_registration,state_registration,fiscal_email,financial_email,phone,address,internal_notes")
      .eq("company_id", profile.company_id)
      .eq("id", id)
      .maybeSingle()
  ]);
  if (!client) notFound();

  const { data: opticalRecords } = company?.service_segment === "otica"
    ? await supabase
      .from("client_optical_records")
      .select("id,exam_date,professional_name,right_eye,left_eye,clinical_data,notes")
      .eq("company_id", profile.company_id)
      .eq("client_id", id)
      .order("exam_date", { ascending: false })
    : { data: [] };

  return (
    <>
      <PageHeader
        area="Cadastros / Clientes / Editar"
        title={client.legal_name}
        description="Atualize os dados cadastrais e fiscais deste cliente."
        action={<a className="ghost-button button-link" href="/cadastros/clientes">Voltar para clientes</a>}
      />
      <section className="form-panel page-form-panel">
        <ClientForm action="update" submitLabel="Salvar cliente" initialValues={{
          id: client.id,
          document: client.document,
          legalName: client.legal_name,
          tradeName: client.trade_name || "",
          phone: client.phone || "",
          fiscalEmail: client.fiscal_email || "",
          financialEmail: client.financial_email || "",
          municipalRegistration: client.municipal_registration || "",
          stateRegistration: client.state_registration || "",
          internalNotes: client.internal_notes || "",
          address: client.address || {}
        }} />
      </section>
      {company?.service_segment === "otica" ? <OpticalPanel clientId={id} records={(opticalRecords || []) as OpticalRecord[]} /> : null}
    </>
  );
}
