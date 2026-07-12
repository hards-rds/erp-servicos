import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

export default function ApisPage() {
  return (
    <>
      <PageHeader
        area="Configuracoes / APIs"
        title="APIs"
        description="Ambientes, escopos e status de conexao sem revelar segredos."
      />
      <section className="table-panel">
        <h2>Integracoes</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Integracao</th>
                <th>Ambiente</th>
                <th>Ultimo teste</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>NFS-e Nacional</td>
                <td>sandbox</td>
                <td>-</td>
                <td><StatusBadge>nao testado</StatusBadge></td>
              </tr>
              <tr>
                <td>Banco Inter</td>
                <td>sandbox</td>
                <td>-</td>
                <td><StatusBadge>nao testado</StatusBadge></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
