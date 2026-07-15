import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/layout/page-header";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type FinancialEntryRow = {
  id: string;
  description: string;
  due_date: string;
  net_amount: number | string;
  status: string;
  clients: { legal_name: string } | { legal_name: string }[] | null;
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

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data: entries } = await supabase
    .from("financial_entries")
    .select("id,description,due_date,net_amount,status,clients(legal_name)")
    .neq("status", "cancelado")
    .order("due_date", { ascending: true })
    .limit(50);
  const { count: activeContracts } = await supabase
    .from("contracts")
    .select("id", { count: "exact", head: true })
    .eq("status", "ativo");
  const { count: pendingNotes } = await supabase
    .from("nfse_documents")
    .select("id", { count: "exact", head: true })
    .in("status", ["rascunho", "validada", "enfileirada", "rejeitada", "erro_integracao"]);
  const financialEntries = (entries || []) as FinancialEntryRow[];
  const expected = sumEntries(financialEntries);
  const received = sumEntries(financialEntries, ["recebido", "conciliado"]);
  const openEntries = financialEntries.filter((entry) => ["previsto", "emitido", "aguardando_pagamento", "vencido"].includes(entry.status));
  const realizedPercent = expected > 0 ? Math.round((received / expected) * 100) : 0;

  return (
    <>
      <PageHeader
        area="Dashboard"
        title="Visao operacional"
        description="Resumo financeiro, fiscal e de contratos recorrentes."
      />
      <section className="metrics">
        <MetricCard label="Recebivel previsto" value={formatMoney(expected)} detail={`${openEntries.length} em aberto`} />
        <MetricCard label="Recebido" value={formatMoney(received)} detail={`${realizedPercent}% realizado`} />
        <MetricCard label="Contratos ativos" value={String(activeContracts || 0)} detail="recorrencia" />
        <MetricCard label="Notas com pendencia" value={String(pendingNotes || 0)} detail="fila fiscal" />
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
