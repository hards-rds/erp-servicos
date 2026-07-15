import { PageHeader } from "@/components/layout/page-header";

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
                <td colSpan={5}>Nenhuma nota emitida.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
