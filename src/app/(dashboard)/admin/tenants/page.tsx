import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  companies: { id: string; name: string; document: string | null; service_segment: string | null; active: boolean }[] | null;
  tenant_members: { user_id: string }[] | null;
};

const messages: Record<string, { type: "success" | "error"; text: string }> = {
  created: { type: "success", text: "Tenant criado com empresa e usuario master." },
  switched: { type: "success", text: "Ambiente ativo alterado. Agora o sistema usa os dados dessa empresa." },
  invalid: { type: "error", text: "Preencha tenant, empresa, master e uma senha com pelo menos 8 caracteres." },
  duplicate_user: { type: "error", text: "Ja existe um usuario com esse e-mail." },
  group_error: { type: "error", text: "Tenant criado, mas houve falha ao gerar grupos padrao." },
  missing_company: { type: "error", text: "Selecione uma empresa valida para trocar o ambiente." },
  forbidden: { type: "error", text: "Apenas system_admin pode administrar tenants." },
  error: { type: "error", text: "Nao foi possivel criar o tenant agora." }
};

const segmentLabels: Record<string, string> = {
  tecnologia: "Tecnologia",
  otica: "Otica",
  generico: "Generico"
};

function documentText(value: string | null) {
  if (!value) return "-";
  return value;
}

export default async function TenantsPage({
  searchParams
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const message = params?.status ? messages[params.status] : null;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role,active").eq("id", user.id).maybeSingle()
    : { data: null };
  const isSystemAdmin = profile?.role === "system_admin" && profile.active !== false;

  const { data: tenants } = isSystemAdmin
    ? await supabase
      .from("tenants")
      .select("id,name,slug,plan,status,companies(id,name,document,service_segment,active),tenant_members(user_id)")
      .order("created_at", { ascending: false })
    : { data: [] };
  const allTenants = (tenants || []) as TenantRow[];

  return (
    <>
      <PageHeader
        area="Admin / Tenants"
        title="Tenants"
        description="Contas SaaS, empresas emitentes e masters de cada cliente."
        action={isSystemAdmin ? <a className="primary-button button-link" href="#novo-tenant">Novo tenant</a> : null}
      />

      {message ? (
        <div className={message.type === "success" ? "form-success" : "form-error"}>{message.text}</div>
      ) : null}

      {!isSystemAdmin ? (
        <section className="form-panel">
          <div className="form-error">Acesso restrito ao administrador do sistema.</div>
        </section>
      ) : (
        <>
          <section className="form-panel" id="novo-tenant">
            <h2>Novo tenant</h2>
            <form className="form-stack" action="/api/admin/tenants" method="post">
              <div className="form-grid">
                <label>
                  Nome do tenant
                  <input name="tenantName" placeholder="Grupo, cliente ou holding" required />
                </label>
                <label>
                  Plano
                  <select name="plan" defaultValue="starter">
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Empresa inicial
                  <input name="companyName" placeholder="Razao social da empresa emitente" required />
                </label>
                <label>
                  CNPJ/CPF da empresa
                  <input name="companyDocument" inputMode="numeric" placeholder="Somente numeros" />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Segmento
                  <select name="serviceSegment" defaultValue="tecnologia">
                    <option value="tecnologia">Tecnologia</option>
                    <option value="otica">Otica</option>
                    <option value="generico">Generico</option>
                  </select>
                </label>
                <label>
                  Master do cliente
                  <input name="masterName" placeholder="Nome completo" required />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  E-mail do master
                  <input name="masterEmail" type="email" placeholder="master@cliente.com" required />
                </label>
                <label>
                  Senha temporaria
                  <input name="masterPassword" type="password" minLength={8} autoComplete="new-password" required />
                </label>
              </div>
              <button className="primary-button" type="submit">Criar tenant</button>
            </form>
          </section>

          <section className="table-panel">
            <h2>Tenants cadastrados</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tenant</th>
                    <th>Slug</th>
                    <th>Plano</th>
                    <th>Status</th>
                    <th>Empresas</th>
                    <th>Segmento</th>
                    <th>Usuarios</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {allTenants.length ? allTenants.map((tenant) => (
                    <tr key={tenant.id}>
                      <td>{tenant.name}</td>
                      <td>{tenant.slug}</td>
                      <td>{tenant.plan}</td>
                      <td><StatusBadge tone={tenant.status === "active" ? "success" : "warning"}>{tenant.status}</StatusBadge></td>
                      <td>
                        {(tenant.companies || []).length
                          ? (tenant.companies || []).map((company) => `${company.name} (${documentText(company.document)})`).join(", ")
                          : "-"}
                      </td>
                      <td>
                        {(tenant.companies || []).length
                          ? (tenant.companies || []).map((company) => segmentLabels[company.service_segment || ""] || company.service_segment || "-").join(", ")
                          : "-"}
                      </td>
                      <td>{tenant.tenant_members?.length || 0}</td>
                      <td>
                        {(tenant.companies || []).length ? (
                          <div className="table-actions">
                            {(tenant.companies || []).map((company) => (
                              <form action="/api/admin/switch-company" method="post" key={company.id}>
                                <input type="hidden" name="companyId" value={company.id} />
                                <input type="hidden" name="redirectTo" value="/dashboard" />
                                <button className="ghost-button" type="submit">Usar ambiente</button>
                              </form>
                            ))}
                          </div>
                        ) : "-"}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={8}>Nenhum tenant cadastrado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
