import { PageHeader } from "@/components/layout/page-header";

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
                <td colSpan={6}>Nenhuma entrada financeira cadastrada.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
