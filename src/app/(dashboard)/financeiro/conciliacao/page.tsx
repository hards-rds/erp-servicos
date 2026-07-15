import { PageHeader } from "@/components/layout/page-header";

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
                <td colSpan={5}>Nenhuma transação bancária importada.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
