import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

export default function ConciliacaoPage() {
  return (
    <>
      <PageHeader
        area="Financeiro / Conciliacao"
        title="Conciliacao bancaria"
        description="Vincule transacoes bancarias a entradas, saidas e ajustes auditados."
      />
      <section className="table-panel">
        <h2>Transacoes pendentes</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Conta</th>
                <th>Descricao</th>
                <th>Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>12/07/2026</td>
                <td>Banco Inter</td>
                <td>Credito Pix</td>
                <td>R$ 3.500,00</td>
                <td><StatusBadge tone="warning">pendente</StatusBadge></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
