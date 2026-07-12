import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

export default function ContratosPage() {
  return (
    <>
      <PageHeader
        area="Cadastros / Contratos"
        title="Contratos recorrentes"
        description="Base de recorrencia financeira, fiscal e de cobrancas."
        action={<button className="primary-button" type="button">Novo contrato</button>}
      />
      <section className="table-panel">
        <h2>Contratos</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Servico</th>
                <th>Valor</th>
                <th>Vencimento</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Cliente Exemplo Ltda</td>
                <td>Suporte mensal</td>
                <td>R$ 3.500,00</td>
                <td>Dia 10</td>
                <td><StatusBadge tone="success">ativo</StatusBadge></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
