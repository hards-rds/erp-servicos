import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

export default function NotasEmitidasPage() {
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
              <tr>
                <td>NFS-e 000001</td>
                <td>Cliente Exemplo Ltda</td>
                <td>2026-07</td>
                <td>R$ 3.500,00</td>
                <td><StatusBadge tone="success">autorizada</StatusBadge></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
