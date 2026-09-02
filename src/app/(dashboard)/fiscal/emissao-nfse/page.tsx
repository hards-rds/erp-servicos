import { NfseBatchQueue } from "@/components/fiscal/nfse-batch-queue";
import { NfseProcessForm } from "@/components/fiscal/nfse-process-form";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { mergeNfseFiscalData } from "@/lib/integrations/nfse-national";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Relation<T> = T | T[] | null;
type FiscalData = Record<string, unknown>;

type NfseRow = {
  id: string;
  competence: string;
  service_amount: number | string;
  status: string;
  rejection_message: string | null;
  request_payload: FiscalData | null;
  companies: Relation<{ name: string; document: string | null }>;
  clients: Relation<{ legal_name: string; document: string; fiscal_email: string | null }>;
  financial_entries: Relation<{
    description: string;
    contract_id: string | null;
    contracts: Relation<{ fiscal_service_data: FiscalData | null }>;
  }>;
};

type EmissaoNfsePageProps = {
  searchParams?: Promise<{ status?: string; message?: string; documentId?: string }>;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  queued: { kind: "success", text: "NFS-e adicionada a fila. O financeiro sera gerado somente depois da autorizacao." },
  processed: { kind: "success", text: "NFS-e autorizada e vinculada ao financeiro." },
  rejected: { kind: "error", text: "NFS-e rejeitada na validacao fiscal. Confira os dados e a mensagem da SEFIN." },
  test_deleted: { kind: "success", text: "Documento de teste excluido; nenhum valor permaneceu no financeiro." },
  deleted_finance_kept: { kind: "success", text: "Documento excluido. O lancamento foi preservado por possuir outra vinculacao." },
  cancelled_finance_cleared: { kind: "success", text: "Nota cancelada preservada no historico e retirada dos totais financeiros." },
  cancelled_finance_blocked: { kind: "error", text: "O financeiro desta nota ja foi recebido ou conciliado e nao pode ser alterado automaticamente." },
  delete_blocked: { kind: "error", text: "Este documento possui XML autorizado e deve permanecer no historico fiscal." },
  delete_error: { kind: "error", text: "Nao foi possivel excluir o documento de teste." },
  forbidden: { kind: "error", text: "Seu usuario nao possui permissao para esta operacao." },
  invalid: { kind: "error", text: "Documento fiscal invalido." },
  not_found: { kind: "error", text: "Documento fiscal nao encontrado." },
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." },
  error: { kind: "error", text: "Nao foi possivel processar a NFS-e agora." },
  batch_submitted: { kind: "success", text: "Lote de NFS-e processado. Confira os status individuais." }
};

function relation<T>(item: Relation<T>) {
  return Array.isArray(item) ? item[0] || null : item;
}

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getClient(document: NfseRow) {
  return relation(document.clients);
}

function getCompany(document: NfseRow) {
  return relation(document.companies);
}

function getEntry(document: NfseRow) {
  return relation(document.financial_entries);
}

function getContractId(document: NfseRow) {
  return getEntry(document)?.contract_id || String(document.request_payload?.contractId || "") || null;
}

function getFiscalData(document: NfseRow) {
  const entry = getEntry(document);
  const contract = relation(entry?.contracts || null);
  return mergeNfseFiscalData(document.request_payload, contract?.fiscal_service_data);
}

function getTone(status: string) {
  if (status === "autorizada") return "success" as const;
  if (["enfileirada", "validada", "enviada", "rejeitada", "erro_integracao"].includes(status)) return "warning" as const;
  return "neutral" as const;
}

function canReview(status: string) {
  return ["rascunho", "validada", "enfileirada", "rejeitada", "erro_integracao"].includes(status);
}

export default async function EmissaoNfsePage({ searchParams }: EmissaoNfsePageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: profile }, { data: canEdit }, { data: canEmit }] = user
    ? await Promise.all([
      supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle(),
      supabase.rpc("app_has_permission", { permission_module: "fiscal.nfse", permission_action: "editar" }),
      supabase.rpc("app_has_permission", { permission_module: "fiscal.nfse", permission_action: "emitir" })
    ])
    : [{ data: null }, { data: false }, { data: false }];
  const { data: documents } = profile?.company_id
    ? await supabase
      .from("nfse_documents")
      .select(`
        id,competence,service_amount,status,rejection_message,request_payload,
        companies(name,document),
        clients(legal_name,document,fiscal_email),
        financial_entries(description,contract_id,contracts(fiscal_service_data))
      `)
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false })
      .limit(100)
    : { data: [] };
  const allDocuments = (documents || []) as NfseRow[];
  const queueDocuments = allDocuments.filter((document) => canReview(document.status));
  const issuedDocuments = allDocuments.filter((document) => ["autorizada", "cancelada"].includes(document.status));
  const selected = params?.documentId
    ? allDocuments.find((document) => document.id === params.documentId) || null
    : null;
  const message = params?.status ? statusMessages[params.status] : null;
  const realProduction = process.env.NFSE_ENV === "production"
    && process.env.NFSE_PRODUCTION_ENABLED === "true"
    && process.env.NFSE_REAL_EMISSION === "true";

  return (
    <>
      <PageHeader
        area="Fiscal / Emissao de NFS-e"
        title="Emissao de NFS-e"
        description="Confira emitente, tomador, servico e tributacao antes de confirmar a emissao."
      />
      {message ? (
        <div className={message.kind === "success" ? "form-success" : "form-error"}>
          {params?.message || message.text}
        </div>
      ) : null}

      {selected ? (() => {
        const company = getCompany(selected);
        const client = getClient(selected);
        const entry = getEntry(selected);
        const fiscalData = getFiscalData(selected);
        return (
          <section className="table-panel">
            <div className="report-results-header">
              <div>
                <h2>Conferencia da NFS-e</h2>
                <p>Revise os dados que serao enviados para a SEFIN Nacional.</p>
              </div>
              <StatusBadge tone={getTone(selected.status)}>{selected.status}</StatusBadge>
            </div>
            <div className="table-wrap">
              <table>
                <tbody>
                  <tr><th>Emitente</th><td>{company?.name || "-"}</td><th>CNPJ</th><td>{company?.document || "-"}</td></tr>
                  <tr><th>Tomador</th><td>{client?.legal_name || "-"}</td><th>CPF/CNPJ</th><td>{client?.document || "-"}</td></tr>
                  <tr><th>E-mail fiscal</th><td>{client?.fiscal_email || "-"}</td><th>Competencia</th><td>{selected.competence}</td></tr>
                  <tr><th>Servico</th><td>{entry?.description || "-"}</td><th>Valor</th><td>{formatMoney(selected.service_amount)}</td></tr>
                  <tr><th>Codigo nacional</th><td>{String(fiscalData.serviceCode || "-")}</td><th>Codigo municipal</th><td>{String(fiscalData.municipalServiceCode || "-")}</td></tr>
                  <tr><th>NBS</th><td>{String(fiscalData.nbsCode || "-")}</td><th>Retencao ISSQN</th><td>{fiscalData.issWithheld ? "Sim" : "Nao"}</td></tr>
                  <tr><th>CST IBS/CBS</th><td>{String(fiscalData.ibsCbsCst || "-")}</td><th>Classificacao tributaria</th><td>{String(fiscalData.ibsCbsTaxClass || "-")}</td></tr>
                  <tr><th>Indicador da operacao</th><td>{String(fiscalData.ibsCbsOperationIndicator || "-")}</td><th>Consumidor final</th><td>{fiscalData.ibsCbsFinalConsumer ? "Sim" : "Nao"}</td></tr>
                </tbody>
              </table>
            </div>
            {selected.rejection_message ? <div className="form-error">{selected.rejection_message}</div> : null}
            <div className="table-actions">
              {canEmit && canReview(selected.status) ? <NfseProcessForm documentId={selected.id} realProduction={realProduction} /> : null}
              <a className="ghost-button compact-button button-link" href="/fiscal/emissao-nfse">Fechar conferencia</a>
            </div>
          </section>
        );
      })() : null}

      <NfseBatchQueue
        documents={queueDocuments.map((document) => ({
          id: document.id,
          description: getEntry(document)?.description || "-",
          clientName: getClient(document)?.legal_name || "-",
          competence: document.competence,
          value: formatMoney(document.service_amount),
          status: document.status,
          rejectionMessage: document.rejection_message,
          contractId: getContractId(document)
        }))}
        canEdit={Boolean(canEdit)}
        canEmit={Boolean(canEmit)}
        realProduction={realProduction}
      />

      <section className="table-panel">
        <div className="report-results-header">
          <div>
            <h2>XML e DANFSe</h2>
            <p>Documentos autorizados ou cancelados preservados no historico fiscal.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tomador</th>
                <th>Competencia</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Downloads</th>
              </tr>
            </thead>
            <tbody>
              {issuedDocuments.length ? issuedDocuments.map((document) => (
                <tr key={document.id}>
                  <td>{getClient(document)?.legal_name || "-"}</td>
                  <td>{document.competence}</td>
                  <td>{formatMoney(document.service_amount)}</td>
                  <td><StatusBadge tone={getTone(document.status)}>{document.status}</StatusBadge></td>
                  <td>
                    <RowActionsMenu label={`Downloads da NFS-e de ${getClient(document)?.legal_name || "cliente"}`}>
                      <a className="ghost-button button-link compact-button" href={`/api/fiscal/nfse/xml?id=${document.id}`}>XML</a>
                      <a className="ghost-button button-link compact-button" href={`/api/fiscal/nfse/danfse?id=${document.id}`}>DANFSe</a>
                      {canEdit && document.status === "cancelada" ? (
                        <form action="/api/fiscal/nfse/ajustar-financeiro-cancelada" method="post">
                          <input type="hidden" name="nfseDocumentId" value={document.id} />
                          <button className="ghost-button compact-button" type="submit">Retirar do financeiro</button>
                        </form>
                      ) : null}
                    </RowActionsMenu>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={5}>Nenhuma NFS-e autorizada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
