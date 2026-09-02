import { MetricCard } from "@/components/ui/metric-card";
import { CompetenceFilter } from "@/components/ui/competence-filter";
import { PageHeader } from "@/components/layout/page-header";
import { competenceDateRange, resolveCompetence } from "@/lib/dates/competence";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type FinancialEntryRow = {
  id: string;
  description: string;
  due_date: string;
  net_amount: number | string;
  received_amount: number | string | null;
  status: string;
  clients: { legal_name: string } | { legal_name: string }[] | null;
};

type PayableRow = {
  amount: number | string;
  status: string;
};

type CommissionRow = {
  commission_amount: number | string;
};

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function sumEntries(entries: FinancialEntryRow[], statuses?: string[]) {
  return entries
    .filter((entry) => !statuses || statuses.includes(entry.status))
    .reduce((total, entry) => total + Number(entry.net_amount || 0), 0);
}

function getClientName(entry: FinancialEntryRow) {
  const client = Array.isArray(entry.clients) ? entry.clients[0] : entry.clients;
  return client?.legal_name || "-";
}

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<{ competence?: string }> }) {
  const params = await searchParams;
  const competence = resolveCompetence(params?.competence);
  const range = competenceDateRange(competence);
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };

  let entries: FinancialEntryRow[] = [];
  let payables: PayableRow[] = [];
  let commissions: CommissionRow[] = [];
  let pendingNotes = 0;
  if (profile?.company_id) {
    const [entriesResult, payablesResult, commissionsResult, notesResult] = await Promise.all([
      supabase
        .from("financial_entries")
        .select("id,description,due_date,net_amount,received_amount,status,clients(legal_name)")
        .eq("company_id", profile.company_id)
        .eq("competence", competence)
        .neq("status", "cancelado")
        .order("due_date", { ascending: true }),
      supabase
        .from("payables")
        .select("amount,status")
        .eq("company_id", profile.company_id)
        .eq("competence", competence)
        .neq("status", "cancelado"),
      supabase
        .from("commissions")
        .select("commission_amount")
        .eq("company_id", profile.company_id)
        .eq("status", "pendente")
        .gte("reference_date", range.start)
        .lt("reference_date", range.next)
        .is("payable_id", null),
      supabase
        .from("nfse_documents")
        .select("id", { count: "exact", head: true })
        .eq("company_id", profile.company_id)
        .eq("competence", competence)
        .in("status", ["rascunho", "validada", "enfileirada", "rejeitada", "erro_integracao"])
    ]);
    entries = (entriesResult.data || []) as FinancialEntryRow[];
    payables = (payablesResult.data || []) as PayableRow[];
    commissions = (commissionsResult.data || []) as CommissionRow[];
    pendingNotes = notesResult.count || 0;
  }

  const financialEntries = (entries || []) as FinancialEntryRow[];
  const expected = sumEntries(financialEntries);
  const receivedEntries = financialEntries.filter((entry) => ["recebido", "conciliado"].includes(entry.status));
  const received = receivedEntries.reduce(
    (total, entry) => total + Number(entry.received_amount || entry.net_amount || 0),
    0
  );
  const openEntries = financialEntries.filter((entry) => ["previsto", "emitido", "aguardando_pagamento", "vencido"].includes(entry.status));
  const pendingCommissions = commissions.reduce(
    (total, commission) => total + Number(commission.commission_amount || 0),
    0
  );
  const expectedExpenses = payables.reduce((total, payable) => total + Number(payable.amount || 0), 0) + pendingCommissions;
  const paidPayables = payables.filter((payable) => ["pago", "conciliado"].includes(payable.status));
  const paidExpenses = paidPayables.reduce((total, payable) => total + Number(payable.amount || 0), 0);
  const openPayables = payables.filter((payable) => !["pago", "conciliado"].includes(payable.status));
  const openExpenseCount = openPayables.length + commissions.length;
  const realizedPercent = expected > 0 ? Math.round((received / expected) * 100) : 0;
  const paidPercent = expectedExpenses > 0 ? Math.round((paidExpenses / expectedExpenses) * 100) : 0;
  const projectedBalance = expected - expectedExpenses;

  return (
    <>
      <PageHeader
        area="Dashboard"
        title="Visao operacional"
        description="Resumo financeiro e fiscal da operacao."
      />
      <CompetenceFilter value={competence} pathname="/dashboard" />
      <section className="metrics dashboard-metrics">
        <MetricCard label="Recebivel previsto" value={formatMoney(expected)} detail={`${openEntries.length} em aberto`} />
        <MetricCard label="Recebido" value={formatMoney(received)} detail={`${realizedPercent}% realizado`} />
        <MetricCard label="Saidas previstas" value={formatMoney(expectedExpenses)} detail={`${openExpenseCount} em aberto`} />
        <MetricCard label="Saidas pagas" value={formatMoney(paidExpenses)} detail={`${paidPercent}% realizado`} />
        <MetricCard label="Saldo projetado" value={formatMoney(projectedBalance)} detail="entradas menos saidas" />
        <MetricCard label="Notas com pendencia" value={String(pendingNotes)} detail="fila fiscal" />
      </section>
      <section className="table-panel">
        <h2>Fila de atencao</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Modulo</th>
                <th>Registro</th>
                <th>Status</th>
                <th>Responsavel</th>
              </tr>
            </thead>
            <tbody>
              {openEntries.length ? (
                openEntries.slice(0, 8).map((entry) => (
                  <tr key={entry.id}>
                    <td>Financeiro</td>
                    <td>{entry.description}</td>
                    <td>{entry.status}</td>
                    <td>{getClientName(entry)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>Nenhum item operacional cadastrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
