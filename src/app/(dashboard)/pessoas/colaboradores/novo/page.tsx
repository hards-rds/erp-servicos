import { ContractorForm } from "@/components/people/contractor-form";
import { PageHeader } from "@/components/layout/page-header";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadContractorClients } from "@/lib/contractor-clients";

export default async function NovoPrestadorPage({ searchParams }: { searchParams?: Promise<{ status?: string }> }) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle() : { data: null };
  if (!profile?.company_id) notFound();
  const clients = await loadContractorClients(supabase, profile.company_id);
  return (
    <>
      <PageHeader
        area="Pessoas / Prestadores PJ / Novo"
        title="Novo prestador PJ"
        description="Defina o CNPJ, a vigencia e a composicao da remuneracao mensal."
        action={<Link className="ghost-button button-link" href="/pessoas/colaboradores">Voltar para prestadores</Link>}
      />
      {params?.status === "invalid" ? <div className="form-error">Revise o CNPJ, a vigencia e os valores informados.</div> : null}
      {params?.status === "invalid_clients" ? <div className="form-error">Selecione pelo menos um cliente valido para a comissao.</div> : null}
      <section className="form-panel page-form-panel">
        <ContractorForm action="create" submitLabel="Cadastrar prestador" clients={clients} />
      </section>
    </>
  );
}
import Link from "next/link";
