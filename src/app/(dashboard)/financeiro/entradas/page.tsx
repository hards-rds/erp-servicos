import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

export default function EntradasPage() {
  return (
    <>
      <PageHeader
        area="Financeiro / Entradas"
        title="Entradas"
        description="Contas a receber recorrentes, manuais, avulsas, boletos e notas fiscais."
        action={<button className="primary-button" type="button">Nova entrada</button>}
      />
      <section className="table-panel">
        <h2>Lancamentos</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Descricao</th>
                <th>Cliente</th>
                <th>Competencia</th>
                <th>Vencimento</th>
                <th>Valor liquido</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Mensalidade contrato ML-042</td>
                <td>Cliente Exemplo Ltda</td>
                <td>2026-07</td>
                <td>10/07/2026</td>
                <td>R$ 3.500,00</td>
                <td><StatusBadge tone="warning">aguardando pagamento</StatusBadge></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
