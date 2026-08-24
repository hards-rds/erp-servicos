import { PageHeader } from "@/components/layout/page-header";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function NovoVendedorPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle() : { data: null };
  const { data: profiles } = profile?.company_id ? await supabase.from("profiles").select("id,name,email").eq("company_id", profile.company_id).order("name") : { data: [] };
  return (
    <>
      <PageHeader area="Financeiro / Comissoes / Vendedores / Novo" title="Novo vendedor" description="Cadastre o vendedor e, se necessario, vincule um usuario do sistema." action={<a className="ghost-button button-link" href="/financeiro/comissoes/vendedores">Voltar para vendedores</a>} />
      <section className="form-panel page-form-panel">
        <form className="form-stack" action="/api/financeiro/vendedores" method="post">
          <input type="hidden" name="action" value="create_seller" />
          <label>Nome<input name="name" required /></label>
          <div className="form-grid"><label>E-mail<input name="email" type="email" /></label><label>Telefone<input name="phone" /></label></div>
          <label>Usuario vinculado<select name="profileId" defaultValue=""><option value="">Sem acesso ao sistema</option>{(profiles || []).map((item) => <option key={item.id} value={item.id}>{item.name || item.email}</option>)}</select></label>
          <label>Observacoes<textarea name="notes" /></label>
          <div className="page-form-actions"><a className="ghost-button button-link" href="/financeiro/comissoes/vendedores">Cancelar</a><button className="primary-button" type="submit">Cadastrar vendedor</button></div>
        </form>
      </section>
    </>
  );
}
