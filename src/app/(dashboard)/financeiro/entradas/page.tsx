import { PageHeader } from "@/components/layout/page-header";
import { EntriesBatchTable, type FinancialEntryTableRow } from "@/components/finance/entries-batch-table";
import { CompetenceFilter } from "@/components/ui/competence-filter";
import { resolveCompetence } from "@/lib/dates/competence";
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
  searchParams?: Promise<{ status?: string; competence?: string; message?: string }>;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  received: { kind: "success", text: "Baixa registrada e entrada marcada como recebida." },
  batch_received: { kind: "success", text: "Baixas registradas com sucesso." },
  batch_partial: { kind: "error", text: "Parte das baixas nao pode ser registrada." },
  invalid: { kind: "error", text: "Revise lancamento, valor e forma de pagamento." },
  receive_error: { kind: "error", text: "Nao foi possivel registrar a baixa agora." },
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." },
  deleted: { kind: "success", text: "Entrada excluida com sucesso." },
  delete_invalid: { kind: "error", text: "Nao foi possivel identificar a entrada para excluir." },
  delete_not_found: { kind: "error", text: "Entrada nao encontrada na empresa ativa ou ja excluida." },
  delete_settled: { kind: "error", text: "Entradas recebidas ou conciliadas devem permanecer no historico financeiro." },
  delete_nfse: { kind: "error", text: "Existe uma NFS-e enviada, autorizada ou cancelada vinculada a esta entrada. O lancamento deve permanecer no historico fiscal e financeiro." },
  delete_charge: { kind: "error", text: "Existe uma cobranca ativa no Banco Inter vinculada a esta entrada. Cancele a cobranca antes de excluir o lancamento." },
  delete_reconciliation: { kind: "error", text: "Esta entrada possui conciliacao bancaria e deve permanecer no historico financeiro." },
  delete_sale: { kind: "error", text: "Esta entrada foi gerada por uma venda. Cancele a venda na origem para ajustar o financeiro." },
  delete_linked: { kind: "error", text: "Esta entrada esta vinculada a uma nota fiscal, boleto, conciliacao ou venda e nao pode ser excluida." },
  delete_check_error: { kind: "error", text: "Nao foi possivel conferir os vinculos desta entrada. Tente novamente antes de excluir." },
  delete_forbidden: { kind: "error", text: "Seu usuario nao possui permissao para excluir entradas." },
  delete_error: { kind: "error", text: "Nao foi possivel excluir a entrada agora." }
};

function getClientName(entry: EntryRow) {
  const client = Array.isArray(entry.clients) ? entry.clients[0] : entry.clients;
  return client?.legal_name || "-";
}

export default async function EntradasPage({ searchParams }: EntradasPageProps) {
  const params = await searchParams;
  const competence = resolveCompetence(params?.competence);
  const statusMessage = params?.status ? statusMessages[params.status] : null;
  const message = params?.message && statusMessage
    ? { ...statusMessage, text: params.message }
    : statusMessage;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };
  const { data: entries } = profile?.company_id
    ? await supabase
      .from("financial_entries")
      .select("id,description,competence,due_date,received_at,received_amount,net_amount,payment_method,status,clients(legal_name)")
      .eq("company_id", profile.company_id)
      .eq("competence", competence)
      .order("due_date", { ascending: false })
      .limit(100)
    : { data: [] };
  const allEntries = (entries || []) as EntryRow[];
  const tableEntries: FinancialEntryTableRow[] = allEntries.map((entry) => ({
    id: entry.id,
    description: entry.description,
    clientName: getClientName(entry),
    competence: entry.competence,
    dueDate: entry.due_date,
    receivedAt: entry.received_at,
    receivedAmount: entry.received_amount,
    netAmount: entry.net_amount,
    paymentMethod: entry.payment_method,
    status: entry.status
  }));

  return (
    <>
      <PageHeader
        area="Financeiro / Entradas"
        title="Entradas"
        description="Contas a receber recorrentes, manuais, avulsas, boletos e notas fiscais."
        action={<a className="primary-button button-link" href="/cadastros/servicos">Novo servico</a>}
      />
      <CompetenceFilter value={competence} pathname="/financeiro/entradas" />
      {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
      <EntriesBatchTable entries={tableEntries} competence={competence} />
    </>
  );
}
