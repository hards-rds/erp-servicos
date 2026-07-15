import { PageHeader } from "@/components/layout/page-header";

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
                <td colSpan={5}>Nenhum contrato cadastrado.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
