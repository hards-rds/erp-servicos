import { PageHeader } from "@/components/layout/page-header";
import { NfseCancelForm } from "@/components/fiscal/nfse-cancel-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
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

function getTone(status: string) {
  if (["autorizada"].includes(status)) return "success" as const;
  if (["enfileirada", "validada", "enviada", "rejeitada", "erro_integracao"].includes(status)) return "warning" as const;
  return "neutral" as const;
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
                    <td>{getNfseNumber(document)}</td>
                    <td>{getClientName(document)}</td>
                    <td>{document.competence}</td>
                    <td>{formatMoney(document.service_amount)}</td>
                    <td><StatusBadge tone={getTone(document.status)}>{document.status}</StatusBadge></td>
                    <td>
                      <RowActionsMenu label={`Acoes da NFS-e de ${getClientName(document)}`}>
                        {["autorizada", "cancelada"].includes(document.status) ? (
                          <>
                            <a className="ghost-button compact-button button-link" href={`/api/fiscal/nfse/xml?id=${document.id}`}>
                              Baixar XML
                            </a>
                            {document.danfse_file_id ? (
                              <>
                                <a className="ghost-button compact-button button-link" href={`/api/fiscal/nfse/danfse?id=${document.id}`}>
                                  Baixar PDF
                                </a>
                                <form action="/api/fiscal/nfse/danfse" method="post">
                                  <input type="hidden" name="nfseDocumentId" value={document.id} />
                                  <button className="ghost-button compact-button" type="submit">Atualizar PDF</button>
                                </form>
                              </>
                            ) : (
                              <form action="/api/fiscal/nfse/danfse" method="post">
                                <input type="hidden" name="nfseDocumentId" value={document.id} />
                                <button className="ghost-button compact-button" type="submit">Gerar PDF</button>
                              </form>
                            )}
                            <form action="/api/fiscal/nfse/enviar-email" method="post">
                              <input type="hidden" name="nfseDocumentId" value={document.id} />
                              <button className="ghost-button compact-button" type="submit">Enviar email</button>
                            </form>
                          </>
                        ) : null}
                        {document.status === "autorizada" && canCancel ? (
                          <NfseCancelForm documentId={document.id} enabled={cancellationEnabled} />
                        ) : null}
                      </RowActionsMenu>
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
