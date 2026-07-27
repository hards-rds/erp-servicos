import { PageHeader } from "@/components/layout/page-header";
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

export default async function NotasEmitidasPage() {
  const supabase = await createServerSupabaseClient();
  const { data: documents } = await supabase
    .from("nfse_documents")
    .select("id,external_id,competence,service_amount,status,clients(legal_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  const allDocuments = (documents || []) as NfseRow[];

  return (
    <>
      <PageHeader
        area="Fiscal / Notas Emitidas"
        title="Notas emitidas"
        description="DPS, NFS-e, XML/JSON de retorno, DANFSe e historico de eventos."
      />
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
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>Nenhuma nota emitida.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
