import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type EntryRow = {
  id: string;
  description: string;
  competence: string;
  due_date: string;
  net_amount: number | string;
  status: string;
  clients: { legal_name: string } | { legal_name: string }[] | null;
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function getClientName(entry: EntryRow) {
  const client = Array.isArray(entry.clients) ? entry.clients[0] : entry.clients;
  return client?.legal_name || "-";
}

function getTone(status: string) {
  if (["recebido", "conciliado"].includes(status)) return "success" as const;
  if (["aguardando_pagamento", "vencido", "emitido"].includes(status)) return "warning" as const;
  return "neutral" as const;
}

export default async function EntradasPage() {
  const supabase = await createServerSupabaseClient();
  const { data: entries } = await supabase
    .from("financial_entries")
    .select("id,description,competence,due_date,net_amount,status,clients(legal_name)")
    .order("due_date", { ascending: false })
    .limit(100);
  const allEntries = (entries || []) as EntryRow[];

  return (
    <>
      <PageHeader
        area="Financeiro / Entradas"
        title="Entradas"
        description="Contas a receber recorrentes, manuais, avulsas, boletos e notas fiscais."
        action={<a className="primary-button button-link" href="/cadastros/servicos">Novo servico</a>}
      />
      <section className="table-panel">
        <h2>Lancamentos</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Descricao</th>
                <th>Cliente</th>
                <th>Competencia</th>
                <th>Vencimento</th>
                <th>Valor liquido</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {allEntries.length ? (
                allEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.description}</td>
                    <td>{getClientName(entry)}</td>
                    <td>{entry.competence}</td>
                    <td>{formatDate(entry.due_date)}</td>
                    <td>{formatMoney(entry.net_amount)}</td>
                    <td><StatusBadge tone={getTone(entry.status)}>{entry.status}</StatusBadge></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>Nenhuma entrada financeira cadastrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
