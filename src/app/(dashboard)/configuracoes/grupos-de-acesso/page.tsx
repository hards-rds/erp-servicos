import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

const permissions = ["visualizar", "criar", "editar", "excluir", "aprovar", "cancelar", "emitir", "conciliar", "configurar"];

export default function GruposDeAcessoPage() {
  return (
    <>
      <PageHeader
        area="Configuracoes / Grupos de Acesso"
        title="Grupos de acesso"
        description="Permissoes granulares por modulo, acao e escopo."
      />
      <div className="two-columns">
        <section className="table-panel">
          <h2>Grupos</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th>Permissoes</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Administracao</td>
                  <td>9</td>
                  <td><StatusBadge tone="success">ativo</StatusBadge></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section className="form-panel">
          <h2>Editor</h2>
          <form className="form-stack">
            <label>Nome do grupo<input placeholder="Administracao" /></label>
            <div className="grid">
              {permissions.map((permission) => (
                <label key={permission}>
                  <input type="checkbox" />
                  {permission}
                </label>
              ))}
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
