import { notFound } from "next/navigation";
import Link from "next/link";
import { ContractorForm } from "@/components/people/contractor-form";
import { PageHeader } from "@/components/layout/page-header";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function EditarPrestadorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ status?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle() : { data: null };
  if (!profile?.company_id) notFound();
  const { data: contractor } = await supabase.from("contractors").select("*").eq("id", id).eq("company_id", profile.company_id).maybeSingle();
  if (!contractor) notFound();
  const name = contractor.trade_name || contractor.legal_name;

  return (
    <>
      <PageHeader
        area="Pessoas / Prestadores PJ / Editar"
        title={name}
        description="As alteracoes de remuneracao serao usadas apenas em fechamentos ainda nao aprovados."
        action={<Link className="ghost-button button-link" href="/pessoas/colaboradores">Voltar para prestadores</Link>}
      />
      {query?.status === "invalid" ? <div className="form-error">Revise o CNPJ, a vigencia e os valores informados.</div> : null}
      {query?.status === "error" ? <div className="form-error">Nao foi possivel atualizar o prestador.</div> : null}
      <section className="form-panel page-form-panel">
        <ContractorForm action="update" submitLabel="Salvar prestador" initialValues={{
          id: contractor.id,
          legalName: contractor.legal_name,
          tradeName: contractor.trade_name || "",
          taxId: contractor.tax_id,
          roleTitle: contractor.role_title,
          email: contractor.email || "",
          phone: contractor.phone || "",
          pixKey: contractor.pix_key || "",
          fixedMonthlyAmount: contractor.fixed_monthly_amount,
          costAllowanceAmount: contractor.cost_allowance_amount,
          commissionRate: contractor.commission_rate,
          commissionBasis: contractor.commission_basis,
          dueDay: contractor.due_day,
          startsAt: contractor.starts_at,
          endsAt: contractor.ends_at || "",
          active: contractor.active,
          notes: contractor.notes || ""
        }} />
      </section>
    </>
  );
}
