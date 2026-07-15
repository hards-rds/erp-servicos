import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type UserGroupRow = {
  groups: {
    id: string;
    name: string;
  } | {
    id: string;
    name: string;
  }[] | null;
};

type ProfileRow = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  active: boolean;
  user_groups: UserGroupRow[] | null;
};

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
};

const passwordMessages: Record<string, { type: "success" | "error"; message: string }> = {
  changed: { type: "success", message: "Senha alterada com sucesso." },
  missing: { type: "error", message: "Preencha a senha atual, a nova senha e a confirmação." },
  short: { type: "error", message: "A nova senha deve ter pelo menos 8 caracteres." },
  mismatch: { type: "error", message: "A confirmação não confere com a nova senha." },
  current: { type: "error", message: "A senha atual não confere." },
  config: { type: "error", message: "Autenticação indisponível no momento." },
  failed: { type: "error", message: "Não foi possível alterar a senha." }
};

const userMessages: Record<string, { type: "success" | "error"; message: string }> = {
  created: { type: "success", message: "Usuario criado com sucesso." },
  updated: { type: "success", message: "Permissoes do usuario atualizadas." },
  activated: { type: "success", message: "Usuario ativado." },
  deactivated: { type: "success", message: "Usuario desativado." },
  invalid: { type: "error", message: "Preencha nome, e-mail, perfil e uma senha com pelo menos 8 caracteres." },
  duplicate: { type: "error", message: "Ja existe um usuario com esse e-mail." },
  forbidden: { type: "error", message: "Apenas usuarios master podem administrar usuarios." },
  invalid_status: { type: "error", message: "Nao foi possivel alterar o status desse usuario." },
  group_error: { type: "error", message: "Usuario salvo, mas houve falha ao vincular os grupos." },
  error: { type: "error", message: "Nao foi possivel salvar o usuario agora." }
};

function getGroupNames(userGroups: UserGroupRow[] | null) {
  return (userGroups || [])
    .map((item) => (Array.isArray(item.groups) ? item.groups[0] : item.groups))
    .filter((group): group is { id: string; name: string } => Boolean(group))
    .map((group) => group.name);
}

function hasGroup(userGroups: UserGroupRow[] | null, groupId: string) {
  return (userGroups || []).some((item) => {
    const group = Array.isArray(item.groups) ? item.groups[0] : item.groups;
    return group?.id === groupId;
  });
}

export default async function UsuariosPage({
  searchParams
}: {
  searchParams?: Promise<{ password?: string; user?: string }>;
}) {
  const params = await searchParams;
  const passwordMessage = params?.password ? passwordMessages[params.password] : null;
  const userMessage = params?.user ? userMessages[params.user] : null;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("name,email,role,active").eq("id", user.id).maybeSingle()
    : { data: null };
  const role = profile?.role || "usuario";
  const active = profile?.active !== false;
  const isMaster = role === "master" && active;
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,name,email,role,active,user_groups(groups(id,name))")
    .order("created_at", { ascending: true });
  const { data: groups } = await supabase
    .from("groups")
    .select("id,name,description,active")
    .eq("active", true)
    .order("name", { ascending: true });
  const allProfiles = (profiles || []) as ProfileRow[];
  const allGroups = (groups || []) as GroupRow[];

  return (
    <>
      <PageHeader
        area="Configuracoes / Usuarios"
        title="Usuarios"
        description="Cadastro de usuarios com vinculo a grupos e perfis de acesso."
        action={<a className="primary-button button-link" href="#novo-usuario">Novo usuario</a>}
      />
      {userMessage ? (
        <div className={userMessage.type === "success" ? "form-success" : "form-error"} role="status">
          {userMessage.message}
        </div>
      ) : null}
      <section className="form-panel" id="novo-usuario">
        <h2>Criar usuario</h2>
        {!isMaster ? (
          <div className="form-error">Apenas usuarios master podem criar ou editar usuarios.</div>
        ) : null}
        <form className="form-stack" action="/api/users" method="post">
          <input type="hidden" name="action" value="create" />
          <div className="form-grid">
            <label>
              Nome
              <input name="name" placeholder="Nome completo" required disabled={!isMaster} />
            </label>
            <label>
              E-mail
              <input name="email" type="email" placeholder="usuario@empresa.com" required disabled={!isMaster} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Senha temporaria
              <input name="password" type="password" minLength={8} autoComplete="new-password" required disabled={!isMaster} />
            </label>
            <label>
              Perfil
              <select name="role" defaultValue="usuario" disabled={!isMaster}>
                <option value="usuario">Usuario</option>
                <option value="admin">Admin</option>
                <option value="master">Master</option>
              </select>
            </label>
          </div>
          <fieldset className="checkbox-panel" disabled={!isMaster}>
            <legend>Grupos de acesso</legend>
            {allGroups.length ? (
              allGroups.map((group) => (
                <label className="checkbox-row" key={group.id}>
                  <input type="checkbox" name="groupIds" value={group.id} />
                  <span>
                    {group.name}
                    {group.description ? <small>{group.description}</small> : null}
                  </span>
                </label>
              ))
            ) : (
              <div className="muted">Nenhum grupo ativo cadastrado.</div>
            )}
          </fieldset>
          <button className="primary-button" type="submit" disabled={!isMaster}>Criar usuario</button>
        </form>
      </section>
      <section className="table-panel">
        <h2>Usuarios cadastrados</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Grupos</th>
                <th>Status</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {allProfiles.length ? (
                allProfiles.map((item) => {
                  const groupNames = getGroupNames(item.user_groups);
                  return (
                    <tr key={item.id}>
                      <td>{item.name || "Sem nome"}</td>
                      <td>{item.email}</td>
                      <td>{item.role}</td>
                      <td>{groupNames.length ? groupNames.join(", ") : "-"}</td>
                      <td><StatusBadge tone={item.active ? "success" : "neutral"}>{item.active ? "ativo" : "inativo"}</StatusBadge></td>
                      <td>
                        {isMaster && item.id !== user?.id ? (
                          <form action="/api/users" method="post">
                            <input type="hidden" name="action" value="status" />
                            <input type="hidden" name="userId" value={item.id} />
                            <input type="hidden" name="active" value={item.active ? "false" : "true"} />
                            <button className="ghost-button compact-button" type="submit">
                              {item.active ? "Desativar" : "Ativar"}
                            </button>
                          </form>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6}>Nenhum usuario cadastrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="table-panel">
        <h2>Perfis e grupos</h2>
        <div className="settings-list">
          {allProfiles.map((item) => (
            <form className="settings-row" action="/api/users" method="post" key={item.id}>
              <input type="hidden" name="action" value="groups" />
              <input type="hidden" name="userId" value={item.id} />
              <div>
                <strong>{item.name || item.email}</strong>
                <div className="muted">{item.email}</div>
              </div>
              <label>
                Perfil
                <select name="role" defaultValue={item.role} disabled={!isMaster}>
                  <option value="usuario">Usuario</option>
                  <option value="admin">Admin</option>
                  <option value="master">Master</option>
                </select>
              </label>
              <fieldset className="checkbox-panel compact-checkboxes" disabled={!isMaster}>
                <legend>Grupos</legend>
                {allGroups.map((group) => (
                  <label className="checkbox-row" key={group.id}>
                    <input type="checkbox" name="groupIds" value={group.id} defaultChecked={hasGroup(item.user_groups, group.id)} />
                    <span>{group.name}</span>
                  </label>
                ))}
              </fieldset>
              <button className="primary-button" type="submit" disabled={!isMaster}>Salvar</button>
            </form>
          ))}
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
