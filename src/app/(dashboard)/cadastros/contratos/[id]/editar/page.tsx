import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ContractForm, type ContractFormValue } from "../../contract-form";

type EditarContratoPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditarContratoPage({ params }: EditarContratoPageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };

  if (!profile?.company_id) notFound();

  const [{ data: clients }, { data: contract }] = await Promise.all([
    supabase
      .from("clients")
      .select("id,legal_name")
      .eq("company_id", profile.company_id)
      .eq("status", "ativo")
      .order("legal_name", { ascending: true }),
    supabase
      .from("contracts")
      .select("id,client_id,service_description,recurring_amount,periodicity,due_day,starts_at,status,auto_generate_financial,auto_issue_nfse,auto_generate_charge,fiscal_service_data,notes")
      .eq("company_id", profile.company_id)
      .eq("id", id)
      .maybeSingle()
  ]);

  if (!contract) notFound();

  return (
    <>
      <PageHeader
        area="Cadastros / Contratos / Editar"
        title="Editar contrato recorrente"
        description="Atualize a recorrencia e os dados usados na emissao fiscal."
        action={<a className="ghost-button button-link" href="/cadastros/contratos">Voltar para contratos</a>}
      />
      <section className="form-panel page-form-panel">
        <ContractForm clients={clients || []} contract={contract as ContractFormValue} />
      </section>
    </>
  );
}
