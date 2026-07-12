import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

export default function ClientesPage() {
  return (
    <>
      <PageHeader
        area="Cadastros / Clientes"
        title="Clientes"
        description="Cadastro fiscal, financeiro e contatos dos clientes recorrentes."
        action={<button className="primary-button" type="button">Novo cliente</button>}
      />
      <div className="two-columns">
        <section className="table-panel">
          <h2>Clientes cadastrados</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome/Razao social</th>
                  <th>CPF/CNPJ</th>
                  <th>E-mail fiscal</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Cliente Exemplo Ltda</td>
                  <td>12.345.678/0001-90</td>
                  <td>fiscal@cliente.com</td>
                  <td><StatusBadge tone="success">ativo</StatusBadge></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section className="form-panel">
          <h2>Dados principais</h2>
          <form className="form-stack">
            <label>Razao social<input placeholder="Nome ou razao social" /></label>
            <label>CPF/CNPJ<input placeholder="00.000.000/0000-00" /></label>
            <label>E-mail fiscal<input type="email" placeholder="fiscal@cliente.com" /></label>
            <label>Observacoes<textarea placeholder="Observacoes internas" /></label>
          </form>
        </section>
      </div>
    </>
  );
}
