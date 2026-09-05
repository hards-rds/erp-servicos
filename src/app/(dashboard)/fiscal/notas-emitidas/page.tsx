import { PageHeader } from "@/components/layout/page-header";
import { IssuedNfseTable, type IssuedNfseDocument } from "@/components/fiscal/issued-nfse-table";
import { CompetenceFilter } from "@/components/ui/competence-filter";
import { resolveCompetence } from "@/lib/dates/competence";
import { resolveOfficialNfseNumber } from "@/lib/fiscal/nfse-xml";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type NfseRow = {
  id: string;
  danfse_file_id: string | null;
  external_id: string | null;
  response_payload: Record<string, unknown> | null;
  competence: string;
  service_amount: number | string;
  status: string;
  clients: { legal_name: string; fiscal_email: string | null } | { legal_name: string; fiscal_email: string | null }[] | null;
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getClientName(document: NfseRow) {
  const client = Array.isArray(document.clients) ? document.clients[0] : document.clients;
  return client?.legal_name || "-";
}

function getNfseNumber(document: NfseRow) {
  return resolveOfficialNfseNumber(document.external_id, document.response_payload) || "Sem numero oficial";
}

type NotasEmitidasPageProps = {
  searchParams?: Promise<{ status?: string; message?: string; competence?: string }>;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  cancelled: { kind: "success", text: "NFS-e cancelada com sucesso." },
  cancel_rejected: { kind: "error", text: "A SEFIN rejeitou o cancelamento da NFS-e." },
  cancel_error: { kind: "error", text: "Nao foi possivel cancelar a NFS-e agora." },
  pdf_generated: { kind: "success", text: "DANFSe gerado e anexado a nota." },
  pdf_error: { kind: "error", text: "Nao foi possivel gerar o DANFSe." },
  email_sent: { kind: "success", text: "DANFSe enviado para o email fiscal do cliente." },
  email_error: { kind: "error", text: "Nao foi possivel enviar o DANFSe por email." },
  invalid: { kind: "error", text: "Documento fiscal invalido." },
  not_found: { kind: "error", text: "Documento fiscal nao encontrado." },
  forbidden: { kind: "error", text: "Seu usuario nao possui permissao para cancelar NFS-e." },
  profile_error: { kind: "error", text: "Seu usuario nao esta ativo ou vinculado a uma empresa." }
};

export default async function NotasEmitidasPage({ searchParams }: NotasEmitidasPageProps) {
  const params = await searchParams;
  const competence = resolveCompetence(params?.competence);
  const supabase = await createServerSupabaseClient();
  const { data: canCancel } = await supabase.rpc("app_has_permission", {
    permission_module: "fiscal.nfse",
    permission_action: "cancelar"
  });
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };
  const { data: documents } = profile?.company_id
    ? await supabase
      .from("nfse_documents")
      .select("id,danfse_file_id,external_id,response_payload,competence,service_amount,status,clients(legal_name,fiscal_email)")
      .eq("company_id", profile.company_id)
      .eq("competence", competence)
      .in("status", ["autorizada", "cancelada"])
      .order("created_at", { ascending: false })
      .limit(100)
    : { data: [] };
  const allDocuments = (documents || []) as NfseRow[];
  const tableDocuments: IssuedNfseDocument[] = allDocuments.map((document) => ({
    id: document.id,
    number: getNfseNumber(document),
    clientName: getClientName(document),
    competence: document.competence,
    value: formatMoney(document.service_amount),
    status: document.status,
    hasPdf: Boolean(document.danfse_file_id)
  }));
  const message = params?.status ? statusMessages[params.status] : null;
  const cancellationEnabled = process.env.NFSE_ENV === "production"
    && process.env.NFSE_PRODUCTION_ENABLED === "true"
    && process.env.NFSE_REAL_EMISSION === "true";

  return (
    <>
      <PageHeader
        area="Fiscal / Notas Emitidas"
        title="Notas emitidas"
        description="DPS, NFS-e, XML/JSON de retorno, DANFSe e historico de eventos."
      />
      <CompetenceFilter value={competence} pathname="/fiscal/notas-emitidas" />
      {message ? (
        <div className={message.kind === "success" ? "form-success" : "form-error"}>
          {params?.message || message.text}
        </div>
      ) : null}
      <IssuedNfseTable
        documents={tableDocuments}
        competence={competence}
        canCancel={Boolean(canCancel)}
        cancellationEnabled={cancellationEnabled}
      />
    </>
  );
}
