import { PageHeader } from "@/components/layout/page-header";

export default function BoletosCobrancasPage() {
  return (
    <>
      <PageHeader
        area="Financeiro / Boletos e Cobrancas"
        title="Boletos e cobrancas"
        description="Cobrancas Banco Inter em sandbox por padrao, vinculadas a entradas financeiras."
      />
      <section className="table-panel">
        <h2>Cobrancas</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Entrada</th>
                <th>Identificador externo</th>
                <th>Vencimento</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={4}>Nenhuma cobrança cadastrada.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
