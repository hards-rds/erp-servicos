import { PageHeader } from "@/components/layout/page-header";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function NovoTenantPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("role,active").eq("id", user.id).maybeSingle() : { data: null };
  const allowed = profile?.role === "system_admin" && profile.active !== false;
  return (
    <>
      <PageHeader area="Admin / Tenants / Novo" title="Novo tenant" description="Crie a conta SaaS, a empresa inicial e o primeiro usuario master." action={<a className="ghost-button button-link" href="/admin/tenants">Voltar para tenants</a>} />
      <section className="form-panel page-form-panel">
        {!allowed ? <div className="form-error">Acesso restrito ao administrador do sistema.</div> : (
          <form className="form-stack" action="/api/admin/tenants" method="post">
            <div className="form-grid">
              <label>Nome do tenant<input name="tenantName" placeholder="Grupo, cliente ou holding" required /></label>
              <label>Plano<select name="plan" defaultValue="starter"><option value="starter">Starter</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select></label>
              <label>Empresa inicial<input name="companyName" placeholder="Razao social da empresa emitente" required /></label>
              <label>CNPJ/CPF da empresa<input name="companyDocument" inputMode="numeric" placeholder="Somente numeros" /></label>
              <label>Segmento<select name="serviceSegment" defaultValue="tecnologia"><option value="tecnologia">Tecnologia</option><option value="otica">Otica</option><option value="generico">Generico</option></select></label>
              <label>Master do cliente<input name="masterName" placeholder="Nome completo" required /></label>
              <label>E-mail do master<input name="masterEmail" type="email" placeholder="master@cliente.com" required /></label>
              <label>Senha temporaria<input name="masterPassword" type="password" minLength={8} autoComplete="new-password" required /></label>
            </div>
            <div className="page-form-actions"><a className="ghost-button button-link" href="/admin/tenants">Cancelar</a><button className="primary-button" type="submit">Criar tenant</button></div>
          </form>
        )}
      </section>
    </>
  );
}
