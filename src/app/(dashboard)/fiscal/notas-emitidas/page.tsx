import { PageHeader } from "@/components/layout/page-header";
import { NfseCancelForm } from "@/components/fiscal/nfse-cancel-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type NfseRow = {
  id: string;
  external_id: string | null;
  competence: string;
  service_amount: number | string;
  status: string;
  clients: { legal_name: string } | { legal_name: string }[] | null;
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getClientName(document: NfseRow) {
  const client = Array.isArray(document.clients) ? document.clients[0] : document.clients;
  return client?.legal_name || "-";
}

function getTone(status: string) {
  if (["autorizada"].includes(status)) return "success" as const;
  if (["enfileirada", "validada", "enviada", "rejeitada", "erro_integracao"].includes(status)) return "warning" as const;
  return "neutral" as const;
}

type NotasEmitidasPageProps = {
  searchParams?: Promise<{ status?: string; message?: string }>;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  cancelled: { kind: "success", text: "NFS-e cancelada com sucesso." },
  cancel_rejected: { kind: "error", text: "A SEFIN rejeitou o cancelamento da NFS-e." },
  cancel_error: { kind: "error", text: "Nao foi possivel cancelar a NFS-e agora." },
  invalid: { kind: "error", text: "Documento fiscal invalido." },
  not_found: { kind: "error", text: "Documento fiscal nao encontrado." },
  forbidden: { kind: "error", text: "Seu usuario nao possui permissao para cancelar NFS-e." },
  profile_error: { kind: "error", text: "Seu usuario nao esta ativo ou vinculado a uma empresa." }
};

export default async function NotasEmitidasPage({ searchParams }: NotasEmitidasPageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: canCancel } = await supabase.rpc("app_has_permission", {
    permission_module: "fiscal.nfse",
    permission_action: "cancelar"
  });
  const { data: documents } = await supabase
    .from("nfse_documents")
    .select("id,external_id,competence,service_amount,status,clients(legal_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  const allDocuments = (documents || []) as NfseRow[];
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
      {message ? (
        <div className={message.kind === "success" ? "form-success" : "form-error"}>
          {params?.message || message.text}
        </div>
      ) : null}
      <section className="table-panel">
        <h2>Documentos fiscais</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Numero</th>
                <th>Cliente</th>
                <th>Competencia</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {allDocuments.length ? (
                allDocuments.map((document) => (
                  <tr key={document.id}>
                    <td>{document.external_id || document.id.slice(0, 8)}</td>
                    <td>{getClientName(document)}</td>
                    <td>{document.competence}</td>
                    <td>{formatMoney(document.service_amount)}</td>
                    <td><StatusBadge tone={getTone(document.status)}>{document.status}</StatusBadge></td>
                    <td>
                      <div className="table-actions">
                        {document.status === "autorizada" && canCancel ? (
                          <NfseCancelForm documentId={document.id} enabled={cancellationEnabled} />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>Nenhuma nota emitida.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
