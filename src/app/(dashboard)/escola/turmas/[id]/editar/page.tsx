import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { SchoolClassForm, type SchoolClassValue } from "@/components/school/class-form";
import { getSchoolContext } from "@/lib/school/server";

export default async function EditClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const context = await getSchoolContext(); const companyId = context.profile?.company_id; if (!context.allowed || !companyId) notFound();
  const { data } = await context.supabase.from("school_classes").select("id,name,category,age_group,coach_name,capacity,schedule,location,default_monthly_fee,active").eq("id", id).eq("company_id", companyId).maybeSingle(); if (!data) notFound();
  return <><PageHeader area="Escola / Turmas / Editar" title={data.name} description="Atualize a configuracao da turma." action={<a className="ghost-button button-link" href="/escola/turmas">Voltar</a>} /><section className="form-panel page-form-panel"><SchoolClassForm schoolClass={data as SchoolClassValue} /></section></>;
}
