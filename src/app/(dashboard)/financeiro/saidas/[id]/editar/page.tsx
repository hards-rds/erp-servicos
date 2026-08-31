import { notFound } from "next/navigation";
import { EditPayableForm } from "@/components/finance/edit-payable-form";
import { PageHeader } from "@/components/layout/page-header";
import { canEditPayable } from "@/domains/finance/payables";
import { payableScheduleLabel, type PayableScheduleType } from "@/domains/finance/payable-schedules";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function EditarSaidaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };
  if (!profile?.company_id) notFound();

  const { data: payable } = await supabase
    .from("payables")
    .select("id,vendor_name,category,description,competence,due_date,amount,status,notes,installment_number,installment_total,payable_series(kind)")
    .eq("id", id)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (!payable || !canEditPayable(payable.status)) notFound();

  const [{ count: commissionCount }, { count: reconciliationCount }] = await Promise.all([
    supabase.from("commissions").select("id", { count: "exact", head: true }).eq("company_id", profile.company_id).eq("payable_id", payable.id),
    supabase.from("bank_reconciliations").select("id", { count: "exact", head: true }).eq("company_id", profile.company_id).eq("payable_id", payable.id)
  ]);
  if (commissionCount || reconciliationCount) notFound();
  const { data: canEdit } = await supabase.rpc("app_has_permission", {
    permission_module: "financeiro.saidas",
    permission_action: "editar"
  });
  if (!canEdit) notFound();

  const series = Array.isArray(payable.payable_series) ? payable.payable_series[0] || null : payable.payable_series;
  const scheduleType: PayableScheduleType = series?.kind || "single";

  return (
    <>
      <PageHeader
        area="Financeiro / Saidas / Editar"
        title="Editar conta a pagar"
        description="Atualize os dados previstos antes da baixa ou conciliacao."
        action={<a className="ghost-button button-link" href="/financeiro/saidas">Voltar para saidas</a>}
      />
      <section className="form-panel page-form-panel">
        <EditPayableForm payable={{
          id: payable.id,
          vendorName: payable.vendor_name,
          category: payable.category,
          description: payable.description,
          competence: payable.competence,
          dueDate: payable.due_date,
          amount: payable.amount,
          status: payable.status,
          notes: payable.notes,
          scheduleLabel: scheduleType === "single" ? null : payableScheduleLabel({
            type: scheduleType,
            installmentNumber: payable.installment_number,
            installmentTotal: payable.installment_total
          })
        }} />
      </section>
    </>
  );
}
