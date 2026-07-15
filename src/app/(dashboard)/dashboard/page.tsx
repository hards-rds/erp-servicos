import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/layout/page-header";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        area="Dashboard"
        title="Visao operacional"
        description="Resumo financeiro, fiscal e de contratos recorrentes."
      />
      <section className="metrics">
        <MetricCard label="Recebivel previsto" value="R$ 0,00" detail="sem lançamentos" />
        <MetricCard label="Recebido" value="R$ 0,00" detail="0% realizado" />
        <MetricCard label="Contratos ativos" value="0" detail="base limpa" />
        <MetricCard label="Notas com pendencia" value="0" detail="fila vazia" />
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
                <td colSpan={4}>Nenhum item operacional cadastrado.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
