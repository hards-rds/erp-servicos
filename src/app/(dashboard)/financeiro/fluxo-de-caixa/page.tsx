import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type EntryRow = {
  net_amount: number | string;
  status: string;
};

type PayableRow = {
  amount: number | string;
  status: string;
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

export default async function FluxoDeCaixaPage() {
  const supabase = await createServerSupabaseClient();
  const { data: entries } = await supabase.from("financial_entries").select("net_amount,status");
  const { data: payables } = await supabase.from("payables").select("amount,status");
  const allEntries = (entries || []) as EntryRow[];
  const allPayables = (payables || []) as PayableRow[];
  const expectedIncome = sumValues(allEntries, "net_amount", ["cancelado"]);
  const receivedIncome = sumValues(allEntries, "net_amount", [], ["recebido", "conciliado"]);
  const expectedExpenses = sumValues(allPayables, "amount", ["cancelado"]);
  const projectedBalance = expectedIncome - expectedExpenses;

  return (
    <>
      <PageHeader
        area="Financeiro / Fluxo de Caixa"
        title="Fluxo de caixa"
        description="Visao por competencia, vencimento e caixa."
      />
      <section className="metrics">
        <MetricCard label="Entradas previstas" value={formatMoney(expectedIncome)} />
        <MetricCard label="Entradas recebidas" value={formatMoney(receivedIncome)} />
        <MetricCard label="Saidas previstas" value={formatMoney(expectedExpenses)} />
        <MetricCard label="Saldo projetado" value={formatMoney(projectedBalance)} />
      </section>
    </>
  );
}
