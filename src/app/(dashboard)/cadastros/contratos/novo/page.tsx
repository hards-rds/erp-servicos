import { PageHeader } from "@/components/layout/page-header";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ContractForm } from "../contract-form";

export default async function NovoContratoPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };
  const { data: clients } = profile?.company_id
    ? await supabase
      .from("clients")
      .select("id,legal_name,document,address")
      .eq("company_id", profile.company_id)
      .eq("status", "ativo")
      .order("legal_name", { ascending: true })
      .order("document", { ascending: true })
    : { data: [] };

  return (
    <>
      <PageHeader
        area="Cadastros / Contratos / Novo"
        title="Novo contrato recorrente"
        description="Defina recorrencia, vencimento e dados fiscais do servico."
        action={<a className="ghost-button button-link" href="/cadastros/contratos">Voltar para contratos</a>}
      />
      <section className="form-panel page-form-panel">
        <ContractForm clients={clients || []} />
      </section>
    </>
  );
}
