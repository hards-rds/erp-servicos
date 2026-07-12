import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

export default function SaidasPage() {
  return (
    <>
      <PageHeader
        area="Financeiro / Saidas"
        title="Saidas e contas a pagar"
        description="Despesas, fornecedores, aprovacao, pagamento e conciliacao."
        action={<button className="primary-button" type="button">Nova saida</button>}
      />
      <section className="table-panel">
        <h2>Contas a pagar</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fornecedor</th>
                <th>Categoria</th>
                <th>Vencimento</th>
                <th>Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Fornecedor Exemplo</td>
                <td>Infraestrutura</td>
                <td>15/07/2026</td>
                <td>R$ 850,00</td>
                <td><StatusBadge>previsto</StatusBadge></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
