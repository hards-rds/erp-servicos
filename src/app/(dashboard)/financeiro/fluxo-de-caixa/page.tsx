import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { CompetenceFilter } from "@/components/ui/competence-filter";
import { competenceDateRange, resolveCompetence } from "@/lib/dates/competence";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type EntryRow = {
  net_amount: number | string;
  status: string;
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

function sumValues<T extends { status: string }>(
  rows: T[],
  amountKey: keyof T,
  excludedStatuses: string[] = [],
  includedStatuses?: string[]
) {
  return rows
    .filter((row) => !excludedStatuses.includes(row.status))
    .filter((row) => !includedStatuses || includedStatuses.includes(row.status))
    .reduce((total, row) => total + Number(row[amountKey] || 0), 0);
}

export default async function FluxoDeCaixaPage({ searchParams }: { searchParams?: Promise<{ competence?: string }> }) {
  const params = await searchParams;
  const competence = resolveCompetence(params?.competence);
  const range = competenceDateRange(competence);
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };

  let entries: EntryRow[] = [];
  let payables: PayableRow[] = [];
  let commissions: CommissionRow[] = [];
  if (profile?.company_id) {
    const [entriesResult, payablesResult, commissionsResult] = await Promise.all([
      supabase
        .from("financial_entries")
        .select("net_amount,status")
        .eq("company_id", profile.company_id)
        .eq("competence", competence),
      supabase
        .from("payables")
        .select("amount,status")
        .eq("company_id", profile.company_id)
        .eq("competence", competence),
      supabase
        .from("commissions")
        .select("commission_amount")
        .eq("company_id", profile.company_id)
        .eq("status", "pendente")
        .gte("reference_date", range.start)
        .lt("reference_date", range.next)
        .is("payable_id", null)
    ]);
    entries = (entriesResult.data || []) as EntryRow[];
    payables = (payablesResult.data || []) as PayableRow[];
    commissions = (commissionsResult.data || []) as CommissionRow[];
  }

  const allEntries = (entries || []) as EntryRow[];
  const allPayables = (payables || []) as PayableRow[];
  const expectedIncome = sumValues(allEntries, "net_amount", ["cancelado"]);
  const receivedIncome = sumValues(allEntries, "net_amount", [], ["recebido", "conciliado"]);
  const pendingCommissions = commissions.reduce(
    (total, commission) => total + Number(commission.commission_amount || 0),
    0
  );
  const expectedExpenses = sumValues(allPayables, "amount", ["cancelado"]) + pendingCommissions;
  const projectedBalance = expectedIncome - expectedExpenses;

  return (
    <>
      <PageHeader
        area="Financeiro / Fluxo de Caixa"
        title="Fluxo de caixa"
        description="Visao por competencia, vencimento e caixa."
      />
      <CompetenceFilter value={competence} pathname="/financeiro/fluxo-de-caixa" />
      <section className="metrics">
        <MetricCard label="Entradas previstas" value={formatMoney(expectedIncome)} />
        <MetricCard label="Entradas recebidas" value={formatMoney(receivedIncome)} />
        <MetricCard label="Saidas previstas" value={formatMoney(expectedExpenses)} />
        <MetricCard
          label="Comissoes pendentes"
          value={formatMoney(pendingCommissions)}
          detail={`${commissions.length} aguardando aprovacao`}
        />
        <MetricCard label="Saldo projetado" value={formatMoney(projectedBalance)} />
      </section>
    </>
  );
}
