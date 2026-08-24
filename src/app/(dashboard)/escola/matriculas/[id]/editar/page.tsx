import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { EnrollmentForm, type EnrollmentValue } from "@/components/school/enrollment-form";
import { getSchoolContext } from "@/lib/school/server";

export default async function EditEnrollmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const context = await getSchoolContext(); const companyId = context.profile?.company_id; if (!context.allowed || !companyId) notFound();
  const [{ data: enrollment }, { data: athletes }, { data: classes }] = await Promise.all([
    context.supabase.from("school_enrollments").select("id,athlete_id,class_id,starts_at,ends_at,due_day,monthly_amount,discount_amount,status,notes").eq("id", id).eq("company_id", companyId).maybeSingle(),
    context.supabase.from("school_athletes").select("id,full_name,category").eq("company_id", companyId).eq("status", "ativo").order("full_name"),
    context.supabase.from("school_classes").select("id,name,category,default_monthly_fee").eq("company_id", companyId).order("name")
  ]); if (!enrollment) notFound();
  return <><PageHeader area="Escola / Matriculas / Editar" title="Editar matricula" description="Atualize turma, valor, vencimento ou situacao." action={<a className="ghost-button button-link" href="/escola/matriculas">Voltar</a>} /><section className="form-panel page-form-panel"><EnrollmentForm athletes={athletes || []} classes={classes || []} enrollment={enrollment as EnrollmentValue} /></section></>;
}
