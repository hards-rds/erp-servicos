import { PageHeader } from "@/components/layout/page-header";

export default function EmissaoNfsePage() {
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
              <tr>
                <td colSpan={5}>Nenhuma nota em fila de emissão.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
