import { PageHeader } from "@/components/layout/page-header";
import { NfseProcessForm } from "@/components/fiscal/nfse-process-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type NfseRow = {
  id: string;
  competence: string;
  service_amount: number | string;
  status: string;
  rejection_message: string | null;
  clients: { legal_name: string } | { legal_name: string }[] | null;
  financial_entries: { description: string; contract_id: string | null } | { description: string; contract_id: string | null }[] | null;
};

type EmissaoNfsePageProps = {
  searchParams?: Promise<{ status?: string; message?: string; documentId?: string }>;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  queued: { kind: "success", text: "Entrada financeira criada e NFS-e preparada. Confirme a emissao na fila fiscal." },
  processed: { kind: "success", text: "NFS-e processada pela inteligencia fiscal." },
  rejected: { kind: "error", text: "NFS-e rejeitada na validacao fiscal. Veja o status da fila." },
  invalid: { kind: "error", text: "Documento fiscal invalido." },
  not_found: { kind: "error", text: "Documento fiscal nao encontrado." },
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." },
  error: { kind: "error", text: "Nao foi possivel processar a NFS-e agora." }
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getClientName(document: NfseRow) {
  const client = Array.isArray(document.clients) ? document.clients[0] : document.clients;
  return client?.legal_name || "-";
}

function getEntryName(document: NfseRow) {
  const entry = Array.isArray(document.financial_entries) ? document.financial_entries[0] : document.financial_entries;
  return entry?.description || "-";
}

function getContractId(document: NfseRow) {
  const entry = Array.isArray(document.financial_entries) ? document.financial_entries[0] : document.financial_entries;
  return entry?.contract_id || null;
}

function getTone(status: string) {
  if (["autorizada"].includes(status)) return "success" as const;
  if (["enfileirada", "validada", "enviada", "rejeitada", "erro_integracao"].includes(status)) return "warning" as const;
  return "neutral" as const;
}

export default async function EmissaoNfsePage({ searchParams }: EmissaoNfsePageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };
  const { data: documents } = profile?.company_id
    ? await supabase
      .from("nfse_documents")
      .select("id,competence,service_amount,status,rejection_message,clients(legal_name),financial_entries(description,contract_id)")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false })
      .limit(100)
    : { data: [] };
  const allDocuments = (documents || []) as NfseRow[];
  const message = params?.status ? statusMessages[params.status] : null;
  const realProduction = process.env.NFSE_ENV === "production"
    && process.env.NFSE_PRODUCTION_ENABLED === "true"
    && process.env.NFSE_REAL_EMISSION === "true";

  return (
    <>
      <PageHeader
        area="Fiscal / Emissao de NFS-e"
        title="Emissao de NFS-e"
        description="Fila de validacao e emissao fiscal; producao exige confirmacao explicita."
      />
      {message ? (
        <div className={message.kind === "success" ? "form-success" : "form-error"}>
          {params?.message || message.text}
        </div>
      ) : null}
      <section className="table-panel">
        <h2>Fila fiscal</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Entrada</th>
                <th>Tomador</th>
                <th>Competencia</th>
                <th>Valor</th>
                <th>Status fiscal</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {allDocuments.length ? (
                allDocuments.map((document) => (
                  <tr key={document.id}>
                    <td>{getEntryName(document)}</td>
                    <td>{getClientName(document)}</td>
                    <td>{document.competence}</td>
                    <td>{formatMoney(document.service_amount)}</td>
                    <td>
                      <StatusBadge tone={getTone(document.status)}>{document.status}</StatusBadge>
                      {document.rejection_message ? (
                        <div className="table-error-detail">{document.rejection_message}</div>
                      ) : null}
                    </td>
                    <td>
                      <div className="table-actions">
                        {document.status === "rejeitada" && getContractId(document) ? (
                          <a
                            className="ghost-button button-link compact-button"
                            href={`/cadastros/contratos?edit=${getContractId(document)}`}
                          >
                            Corrigir
                          </a>
                        ) : null}
                        <NfseProcessForm documentId={document.id} realProduction={realProduction} />
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>Nenhuma nota em fila de emissão.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
