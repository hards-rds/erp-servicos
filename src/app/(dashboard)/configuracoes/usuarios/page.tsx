import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const passwordMessages: Record<string, { type: "success" | "error"; message: string }> = {
  changed: { type: "success", message: "Senha alterada com sucesso." },
  missing: { type: "error", message: "Preencha a senha atual, a nova senha e a confirmação." },
  short: { type: "error", message: "A nova senha deve ter pelo menos 8 caracteres." },
  mismatch: { type: "error", message: "A confirmação não confere com a nova senha." },
  current: { type: "error", message: "A senha atual não confere." },
  config: { type: "error", message: "Autenticação indisponível no momento." },
  failed: { type: "error", message: "Não foi possível alterar a senha." }
};

export default async function UsuariosPage({
  searchParams
}: {
  searchParams?: Promise<{ password?: string }>;
}) {
  const params = await searchParams;
  const passwordMessage = params?.password ? passwordMessages[params.password] : null;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("name,email,role,active").eq("id", user.id).maybeSingle()
    : { data: null };
  const name = profile?.name || "Usuário";
  const email = profile?.email || user?.email || "";
  const role = profile?.role || "usuario";
  const active = profile?.active !== false;

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
                <td>{name}</td>
                <td>{email}</td>
                <td>{role}</td>
                <td><StatusBadge tone={active ? "success" : "neutral"}>{active ? "ativo" : "inativo"}</StatusBadge></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section className="form-panel">
        <h2>Alterar minha senha</h2>
        {passwordMessage ? (
          <div className={passwordMessage.type === "success" ? "form-success" : "form-error"} role="status">
            {passwordMessage.message}
          </div>
        ) : null}
        <form className="form-stack" action="/api/auth/change-password" method="post">
          <label>
            Senha atual
            <input name="currentPassword" type="password" autoComplete="current-password" required />
          </label>
          <label>
            Nova senha
            <input name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <label>
            Confirmar nova senha
            <input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <button className="primary-button" type="submit">Alterar senha</button>
        </form>
      </section>
    </>
  );
}
