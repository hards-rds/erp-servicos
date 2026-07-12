import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

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
                <td>Mensalidade ML-042</td>
                <td>Cliente Exemplo Ltda</td>
                <td>2026-07</td>
                <td>R$ 3.500,00</td>
                <td><StatusBadge tone="warning">validada</StatusBadge></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
