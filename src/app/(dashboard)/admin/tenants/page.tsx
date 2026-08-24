import { TenantActions } from "@/components/admin/tenant-actions";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  companies: { id: string; name: string; document: string | null; service_segment: string | null; active: boolean }[] | null;
  tenant_members: {
    user_id: string;
    role: string;
    profile: {
      id: string;
      name: string | null;
      email: string;
      role: string;
      active: boolean;
    } | Array<{
      id: string;
      name: string | null;
      email: string;
      role: string;
      active: boolean;
    }> | null;
  }[] | null;
};

const messages: Record<string, { type: "success" | "error"; text: string }> = {
  created: { type: "success", text: "Tenant criado com empresa e usuario master." },
  updated: { type: "success", text: "Dados do tenant atualizados com sucesso." },
  switched: { type: "success", text: "Ambiente ativo alterado. Agora o sistema usa os dados dessa empresa." },
  invalid: { type: "error", text: "Preencha tenant, empresa, master e uma senha com pelo menos 8 caracteres." },
  duplicate_user: { type: "error", text: "Ja existe um usuario com esse e-mail." },
  group_error: { type: "error", text: "Tenant criado, mas houve falha ao gerar grupos padrao." },
  missing_company: { type: "error", text: "Selecione uma empresa valida para trocar o ambiente." },
  forbidden: { type: "error", text: "Apenas system_admin pode administrar tenants." },
  update_invalid: { type: "error", text: "Revise os dados informados para o tenant e a empresa." },
  update_not_found: { type: "error", text: "Tenant, empresa ou master nao encontrado." },
  error: { type: "error", text: "Nao foi possivel salvar o tenant agora." }
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

function tenantMaster(tenant: TenantRow) {
  const membership = (tenant.tenant_members || []).find((member) => {
    const profile = Array.isArray(member.profile) ? member.profile[0] : member.profile;
    return member.role === "owner" || profile?.role === "master";
  });
  const profile = membership && (Array.isArray(membership.profile) ? membership.profile[0] : membership.profile);
  return profile ? { id: profile.id, name: profile.name, email: profile.email } : null;
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
    ? await createServiceClient()
      .from("tenants")
      .select("id,name,slug,plan,status,companies(id,name,document,service_segment,active),tenant_members(user_id,role,profile:profiles!tenant_members_user_id_fkey(id,name,email,role,active))")
      .order("created_at", { ascending: false })
    : { data: [] };
  const allTenants = (tenants || []) as TenantRow[];

  return (
    <>
      <PageHeader
        area="Admin / Tenants"
        title="Tenants"
        description="Contas SaaS, empresas emitentes e masters de cada cliente."
        action={isSystemAdmin ? <a className="primary-button button-link" href="/admin/tenants/novo">Novo tenant</a> : null}
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
                          <RowActionsMenu label={`Acoes do tenant ${tenant.name}`}>
                            {(tenant.companies || []).map((company) => (
                              <div className="tenant-company-actions" key={company.id}>
                                <TenantActions
                                  tenant={{
                                    id: tenant.id,
                                    name: tenant.name,
                                    slug: tenant.slug,
                                    plan: tenant.plan,
                                    status: tenant.status
                                  }}
                                  company={{
                                    id: company.id,
                                    name: company.name,
                                    document: company.document,
                                    serviceSegment: company.service_segment,
                                    active: company.active
                                  }}
                                  master={tenantMaster(tenant)}
                                />
                                <form action="/api/admin/switch-company" method="post">
                                  <input type="hidden" name="companyId" value={company.id} />
                                  <input type="hidden" name="redirectTo" value="/dashboard" />
                                  <button className="ghost-button compact-button" type="submit">Usar ambiente</button>
                                </form>
                              </div>
                            ))}
                          </RowActionsMenu>
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
