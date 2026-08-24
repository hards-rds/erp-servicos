import { PageHeader } from "@/components/layout/page-header";
import { EnrollmentForm } from "@/components/school/enrollment-form";
import { getSchoolContext } from "@/lib/school/server";

export default async function NewEnrollmentPage() {
  const context = await getSchoolContext(); const companyId = context.profile?.company_id;
  const [{ data: athletes }, { data: classes }] = context.allowed && companyId ? await Promise.all([
    context.supabase.from("school_athletes").select("id,full_name,category").eq("company_id", companyId).eq("status", "ativo").order("full_name"),
    context.supabase.from("school_classes").select("id,name,category,default_monthly_fee").eq("company_id", companyId).eq("active", true).order("name")
  ]) : [{ data: [] }, { data: [] }];
  return <><PageHeader area="Escola / Matriculas / Nova" title="Nova matricula" description="Vincule atleta, turma e plano financeiro." action={<a className="ghost-button button-link" href="/escola/matriculas">Voltar</a>} />{context.allowed ? <section className="form-panel page-form-panel"><EnrollmentForm athletes={athletes || []} classes={classes || []} /></section> : <div className="form-error">Selecione uma empresa do segmento Escola de futebol.</div>}</>;
}
