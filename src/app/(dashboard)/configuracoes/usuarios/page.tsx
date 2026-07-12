import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

export default function UsuariosPage() {
  return (
    <>
      <PageHeader
        area="Configuracoes / Usuarios"
        title="Usuarios"
        description="Cadastro de usuarios com vinculo a grupos e perfis de acesso."
        action={<button className="primary-button" type="button">Novo usuario</button>}
      />
      <section className="table-panel">
        <h2>Usuarios ativos</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Administrador</td>
                <td>admin@empresa.com</td>
                <td>master</td>
                <td><StatusBadge tone="success">ativo</StatusBadge></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
