import { AthleteForm } from "@/components/school/athlete-form";
import { PageHeader } from "@/components/layout/page-header";
import { getSchoolContext } from "@/lib/school/server";

export default async function NewAthletePage() {
  const context = await getSchoolContext();
  const companyId = context.profile?.company_id;
  const { data: clients } = context.allowed && companyId
    ? await context.supabase.from("clients").select("id,legal_name,document").eq("company_id", companyId).eq("status", "ativo").order("legal_name")
    : { data: [] };
  return <>
    <PageHeader area="Escola / Atletas / Novo" title="Novo atleta" description="Cadastre o atleta, o responsavel e os consentimentos." action={<a className="ghost-button button-link" href="/escola/atletas">Voltar</a>} />
    {!context.allowed ? <div className="form-error">Selecione uma empresa do segmento Escola de futebol.</div> : <section className="form-panel page-form-panel"><AthleteForm clients={clients || []} /></section>}
  </>;
}
