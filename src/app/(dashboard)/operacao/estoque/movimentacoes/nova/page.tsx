import { StockMovementForm } from "@/components/inventory/inventory-forms";
import { PageHeader } from "@/components/layout/page-header";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function NovaMovimentacaoPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle() : { data: null };
  const { data: products } = profile?.company_id
    ? await supabase.from("products").select("id,name").eq("company_id", profile.company_id).eq("active", true).order("name")
    : { data: [] };
  return (
    <>
      <PageHeader area="Operacao / Estoque / Movimentacoes / Nova" title="Movimentar estoque" description="Registre entradas, saidas ou ajustes de saldo." action={<a className="ghost-button button-link" href="/operacao/estoque">Voltar para estoque</a>} />
      <section className="form-panel page-form-panel"><StockMovementForm products={products || []} /></section>
    </>
  );
}
