import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type NfseRow = {
  id: string;
  competence: string;
  service_amount: number | string;
  status: string;
  clients: { legal_name: string } | { legal_name: string }[] | null;
  financial_entries: { description: string } | { description: string }[] | null;
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

function getTone(status: string) {
  if (["autorizada"].includes(status)) return "success" as const;
  if (["enfileirada", "validada", "enviada", "rejeitada", "erro_integracao"].includes(status)) return "warning" as const;
  return "neutral" as const;
}

export default async function EmissaoNfsePage() {
  const supabase = await createServerSupabaseClient();
  const { data: documents } = await supabase
    .from("nfse_documents")
    .select("id,competence,service_amount,status,clients(legal_name),financial_entries(description)")
    .order("created_at", { ascending: false })
    .limit(100);
  const allDocuments = (documents || []) as NfseRow[];

  return (
    <>
      <PageHeader
        area="Fiscal / Emissao de NFS-e"
        title="Emissao de NFS-e"
        description="Fila de validacao e emissao fiscal; producao exige confirmacao explicita."
      />
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
                    <td><StatusBadge tone={getTone(document.status)}>{document.status}</StatusBadge></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>Nenhuma nota em fila de emissão.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
