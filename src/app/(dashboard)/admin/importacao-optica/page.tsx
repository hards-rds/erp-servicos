import { notFound } from "next/navigation";
import { OpticalImportForm } from "@/components/admin/optical-import-form";
import { PageHeader } from "@/components/layout/page-header";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";

export default async function OpticalImportPage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  const companyId = (await searchParams)?.companyId || "";
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("role,active,company_id").eq("id", user.id).maybeSingle() : { data: null };
  const allowed = profile?.active !== false && (profile?.role === "system_admin" || (profile?.role === "master" && profile.company_id === companyId));
  if (!allowed) notFound();
  const { data: company } = await createServiceClient().from("companies").select("id,name,service_segment,tenants(name)").eq("id", companyId).maybeSingle();
  if (!company || company.service_segment !== "otica") notFound();
  const tenant = Array.isArray(company.tenants) ? company.tenants[0] : company.tenants;

  return (
    <>
      <PageHeader area="Configuracoes / Importacoes / Otica" title="Importar pacientes e receitas" description={`${tenant?.name || "Tenant"} - ${company.name}`} action={<a className="ghost-button button-link" href="/configuracoes/importacoes">Voltar para importacoes</a>} />
      <section className="form-panel page-form-panel">
        <OpticalImportForm companyId={company.id} />
      </section>
    </>
  );
}
