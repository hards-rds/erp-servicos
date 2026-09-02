import { PageHeader } from "@/components/layout/page-header";
import { PayableActions } from "@/components/finance/payable-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { CompetenceFilter } from "@/components/ui/competence-filter";
import { canEditPayable, canMarkPayablePaid } from "@/domains/finance/payables";
import { payableScheduleLabel, type PayableScheduleType } from "@/domains/finance/payable-schedules";
import { resolveCompetence } from "@/lib/dates/competence";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type PayableRow = {
  id: string;
  vendor_name: string;
  category: string;
  description: string;
  competence: string;
  due_date: string;
  paid_at: string | null;
  amount: number | string;
  payment_method: string | null;
  status: string;
  series_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  payable_series: { kind: "installment" | "fixed"; active: boolean } | Array<{ kind: "installment" | "fixed"; active: boolean }> | null;
};

type SaidasPageProps = {
  searchParams?: Promise<{ status?: string; competence?: string }>;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  created: { kind: "success", text: "Conta a pagar cadastrada com sucesso." },
  installments_created: { kind: "success", text: "Compra parcelada cadastrada e parcelas geradas no fluxo financeiro." },
  fixed_created: { kind: "success", text: "Despesa fixa cadastrada e proximas competencias geradas no fluxo financeiro." },
  invalid: { kind: "error", text: "Revise os dados da conta, o valor e as datas informadas." },
  error: { kind: "error", text: "Nao foi possivel cadastrar a conta a pagar agora." },
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." },
  updated: { kind: "success", text: "Conta a pagar atualizada com sucesso." },
  paid: { kind: "success", text: "Pagamento registrado e saida marcada como paga." },
  not_found: { kind: "error", text: "Conta a pagar nao encontrada na empresa ativa." },
  settled: { kind: "error", text: "Contas pagas ou conciliadas nao podem ser alteradas." },
  linked: { kind: "error", text: "Esta conta e controlada por uma comissao ou conciliacao e deve ser alterada no modulo de origem." },
  forbidden: { kind: "error", text: "Seu usuario nao possui permissao para esta operacao." },
  update_error: { kind: "error", text: "Nao foi possivel atualizar a conta a pagar agora." },
  payment_error: { kind: "error", text: "Nao foi possivel registrar o pagamento agora." },
  series_stopped: { kind: "success", text: "Despesa fixa encerrada. Os meses futuros em aberto foram cancelados." },
  series_already_stopped: { kind: "error", text: "Esta despesa fixa ja estava encerrada." },
  series_stop_error: { kind: "error", text: "Nao foi possivel encerrar a despesa fixa agora." },
  schedule_error: { kind: "error", text: "Nao foi possivel gerar as competencias da despesa. Revise os dados informados." }
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatPaymentMethod(value: string | null) {
  if (!value) return "-";
  const labels: Record<string, string> = {
    pix: "Pix",
    cartao_credito: "Cartao de credito",
    cartao_debito: "Cartao de debito",
    dinheiro: "Dinheiro",
    boleto: "Boleto",
    transferencia: "Transferencia",
    outro: "Outro"
  };
  return labels[value] || value;
}

function getTone(status: string) {
  if (["pago", "conciliado"].includes(status)) return "success" as const;
  if (["previsto", "aprovado", "vencido"].includes(status)) return "warning" as const;
  return "neutral" as const;
}

function getSeries(payable: PayableRow) {
  return Array.isArray(payable.payable_series) ? payable.payable_series[0] || null : payable.payable_series;
}

export default async function SaidasPage({ searchParams }: SaidasPageProps) {
  const params = await searchParams;
  const competence = resolveCompetence(params?.competence);
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };

  let payables: PayableRow[] = [];
  const protectedPayableIds = new Set<string>();
  const protectedEditPayableIds = new Set<string>();
  let canEdit = false;
  let canPay = false;
  if (profile?.company_id) {
    const [{ data }, { data: editPermission }, { data: payPermission }] = await Promise.all([
      supabase
        .from("payables")
        .select("id,vendor_name,category,description,competence,due_date,paid_at,amount,payment_method,status,series_id,installment_number,installment_total,payable_series(kind,active)")
        .eq("company_id", profile.company_id)
        .eq("competence", competence)
        .order("due_date", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(500),
      supabase.rpc("app_has_permission", { permission_module: "financeiro.saidas", permission_action: "editar" }),
      supabase.rpc("app_has_permission", { permission_module: "financeiro.saidas", permission_action: "aprovar" })
    ]);
    payables = (data || []) as PayableRow[];
    canEdit = Boolean(editPermission);
    canPay = Boolean(payPermission);
    const payableIds = payables.map((payable) => payable.id);
    if (payableIds.length) {
      const [{ data: commissions }, { data: reconciliations }, { data: contractorCompensations }] = await Promise.all([
        supabase.from("commissions").select("payable_id").eq("company_id", profile.company_id).in("payable_id", payableIds),
        supabase.from("bank_reconciliations").select("payable_id").eq("company_id", profile.company_id).in("payable_id", payableIds),
        supabase.from("contractor_compensations").select("payable_id").eq("company_id", profile.company_id).in("payable_id", payableIds)
      ]);
      for (const item of [...(commissions || []), ...(reconciliations || [])]) {
        if (item.payable_id) protectedPayableIds.add(item.payable_id);
      }
      for (const item of contractorCompensations || []) {
        if (item.payable_id) protectedEditPayableIds.add(item.payable_id);
      }
    }
  }

  const message = params?.status
    ? statusMessages[params.status]
    : !profile?.company_id
      ? statusMessages.profile_error
      : null;

  return (
    <>
      <PageHeader
        area="Financeiro / Saidas"
        title="Saidas e contas a pagar"
        description="Despesas, fornecedores, aprovacao, pagamento e conciliacao."
        action={<a className="primary-button button-link" href="/financeiro/saidas/nova">Nova saida</a>}
      />
      <CompetenceFilter value={competence} pathname="/financeiro/saidas" />
      {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
      <section className="table-panel">
        <h2>Contas a pagar</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fornecedor</th>
                <th>Categoria</th>
                <th>Tipo</th>
                <th>Competencia</th>
                <th>Vencimento</th>
                <th>Valor</th>
                <th>Pagamento</th>
                <th>Status</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {payables.length ? payables.map((payable) => {
                const series = getSeries(payable);
                const scheduleType: PayableScheduleType = series?.kind || "single";
                return (
                  <tr key={payable.id}>
                    <td>
                      <strong>{payable.vendor_name}</strong>
                      <div className="muted">{payable.description}</div>
                    </td>
                    <td>{payable.category}</td>
                    <td>{payableScheduleLabel({ type: scheduleType, installmentNumber: payable.installment_number, installmentTotal: payable.installment_total })}</td>
                    <td>{payable.competence}</td>
                    <td>{formatDate(payable.due_date)}</td>
                    <td>{formatMoney(payable.amount)}</td>
                    <td>
                      {payable.paid_at ? (
                        <>
                          <strong>{formatDate(payable.paid_at)}</strong>
                          <div className="muted">{formatPaymentMethod(payable.payment_method)}</div>
                        </>
                      ) : "-"}
                    </td>
                    <td><StatusBadge tone={getTone(payable.status)}>{payable.status}</StatusBadge></td>
                    <td>
                      <PayableActions
                        payableId={payable.id}
                        description={payable.description}
                        amount={payable.amount}
                        canEdit={canEdit && !protectedPayableIds.has(payable.id) && !protectedEditPayableIds.has(payable.id) && canEditPayable(payable.status)}
                        canPay={canPay && !protectedPayableIds.has(payable.id) && canMarkPayablePaid(payable.status)}
                        canStopSeries={canEdit && series?.kind === "fixed" && series.active}
                        seriesId={payable.series_id}
                      />
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={9}>Nenhuma saida cadastrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
