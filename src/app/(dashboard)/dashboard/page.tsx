import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        area="Dashboard"
        title="Visao operacional"
        description="Resumo financeiro, fiscal e de contratos recorrentes."
      />
      <section className="metrics">
        <MetricCard label="Recebivel previsto" value="R$ 128.450,00" detail="competencia atual" />
        <MetricCard label="Recebido" value="R$ 84.210,00" detail="65,6% realizado" />
        <MetricCard label="Contratos ativos" value="42" detail="3 com reajuste pendente" />
        <MetricCard label="Notas com pendencia" value="7" detail="validacao fiscal" />
      </section>
      <section className="table-panel">
        <h2>Fila de atencao</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Modulo</th>
                <th>Registro</th>
                <th>Status</th>
                <th>Responsavel</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Financeiro</td>
                <td>Entrada recorrente JUL/2026</td>
                <td><StatusBadge tone="warning">aguardando pagamento</StatusBadge></td>
                <td>Financeiro</td>
              </tr>
              <tr>
                <td>Fiscal</td>
                <td>NFS-e contrato ML-042</td>
                <td><StatusBadge>validada</StatusBadge></td>
                <td>Fiscal</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
