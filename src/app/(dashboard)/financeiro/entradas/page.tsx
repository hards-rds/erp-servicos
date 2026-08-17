import { PageHeader } from "@/components/layout/page-header";
import { ReceiveEntryForm } from "@/components/finance/receive-entry-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type EntryRow = {
  id: string;
  description: string;
  competence: string;
  due_date: string;
  received_at: string | null;
  received_amount: number | string | null;
  net_amount: number | string;
  payment_method: string | null;
  status: string;
  clients: { legal_name: string } | { legal_name: string }[] | null;
};

type EntradasPageProps = {
  searchParams?: Promise<{ status?: string }>;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  received: { kind: "success", text: "Baixa registrada e entrada marcada como recebida." },
  invalid: { kind: "error", text: "Revise lancamento, valor e forma de pagamento." },
  receive_error: { kind: "error", text: "Nao foi possivel registrar a baixa agora." },
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." }
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

function canReceive(entry: EntryRow) {
  return !["recebido", "conciliado", "cancelado"].includes(entry.status);
}

export default async function EntradasPage({ searchParams }: EntradasPageProps) {
  const params = await searchParams;
  const message = params?.status ? statusMessages[params.status] : null;
  const supabase = await createServerSupabaseClient();
  const { data: entries } = await supabase
    .from("financial_entries")
    .select("id,description,competence,due_date,received_at,received_amount,net_amount,payment_method,status,clients(legal_name)")
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
      {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
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
                <th>Recebimento</th>
                <th>Status</th>
                <th>Acoes</th>
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
                    <td>
                      {entry.received_at ? (
                        <>
                          <strong>{formatMoney(entry.received_amount || entry.net_amount)}</strong>
                          <div className="muted">{formatDate(entry.received_at)} · {entry.payment_method || "-"}</div>
                        </>
                      ) : "-"}
                    </td>
                    <td><StatusBadge tone={getTone(entry.status)}>{entry.status}</StatusBadge></td>
                    <td>
                      {canReceive(entry) ? (
                        <ReceiveEntryForm
                          entryId={entry.id}
                          description={entry.description}
                          amount={entry.net_amount}
                        />
                      ) : "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>Nenhuma entrada financeira cadastrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
