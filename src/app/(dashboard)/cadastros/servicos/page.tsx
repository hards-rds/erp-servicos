import { PageHeader } from "@/components/layout/page-header";
import { CatalogServiceActions } from "@/components/services/catalog-service-actions";
import { DeleteServiceButton } from "@/components/services/delete-service-button";
import { canDeleteServiceStatus } from "@/domains/services/deletion";
import { segmentLabels, serviceTypeOptions, type ServiceSegment } from "@/domains/services/catalog";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ServicosPageProps = { searchParams?: Promise<{ status?: string; view?: string }> };
type CatalogService = { id: string; code: string | null; name: string; description: string | null; category: string | null; service_type: string; sale_price: number | string; fiscal_service_data: Record<string, unknown> | null; notes: string | null; active: boolean };
type ServiceRecord = { id: string; service_description: string; service_type: string; amount: number | string; service_date: string; status: string; fiscal_service_data: Record<string, unknown> | null; clients: { legal_name: string } | { legal_name: string }[] | null };

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  catalog_created: { kind: "success", text: "Servico adicionado ao catalogo." },
  catalog_updated: { kind: "success", text: "Servico do catalogo atualizado." },
  catalog_invalid: { kind: "error", text: "Revise nome, tipo e preco do servico." },
  catalog_duplicate: { kind: "error", text: "Ja existe um servico com este codigo." },
  catalog_error: { kind: "error", text: "Nao foi possivel salvar o servico no catalogo." },
  fiscal_invalid: { kind: "error", text: "Revise o codigo nacional do servico e o NBS." },
  created: { kind: "success", text: "Atendimento cadastrado com sucesso." },
  updated: { kind: "success", text: "Atendimento atualizado com sucesso." },
  deleted: { kind: "success", text: "Atendimento excluido com sucesso." },
  invalid: { kind: "error", text: "Revise cliente, descricao e valor antes de salvar." },
  delete_not_stopped: { kind: "error", text: "Cancele o atendimento antes de exclui-lo." },
  delete_financial: { kind: "error", text: "Este atendimento possui lancamento financeiro e deve permanecer no historico." },
  error: { kind: "error", text: "Nao foi possivel salvar o atendimento agora." },
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." }
};

function formatMoney(value: number | string) { return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function formatDate(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR"); }
function getClient(service: ServiceRecord) { return Array.isArray(service.clients) ? service.clients[0] : service.clients; }
function detailsSummary(service: ServiceRecord) {
  const data = service.fiscal_service_data || {};
  return data.segment === "otica"
    ? [data.lensType, data.frameModel].filter(Boolean).join(" · ")
    : [data.serviceMode, data.priority, data.ticketNumber].filter(Boolean).join(" · ");
}

export default async function ServicosPage({ searchParams }: ServicosPageProps) {
  const params = await searchParams;
  const view = params?.view === "atendimentos" ? "atendimentos" : "catalogo";
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle() : { data: null };
  const { data: company } = profile?.company_id ? await supabase.from("companies").select("service_segment").eq("id", profile.company_id).maybeSingle() : { data: null };
  const segment = (company?.service_segment || "tecnologia") as ServiceSegment;
  const typeOptions = serviceTypeOptions[segment] || serviceTypeOptions.tecnologia;
  const [{ data: services }, { data: catalog }] = profile?.company_id ? await Promise.all([
    supabase.from("service_records").select("id,service_description,service_type,amount,service_date,status,fiscal_service_data,clients(legal_name)").eq("company_id", profile.company_id).order("service_date", { ascending: false }).limit(100),
    supabase.from("service_catalog").select("id,code,name,description,category,service_type,sale_price,fiscal_service_data,notes,active").eq("company_id", profile.company_id).order("active", { ascending: false }).order("name")
  ]) : [{ data: [] }, { data: [] }];
  const allServices = (services || []) as ServiceRecord[];
  const allCatalog = (catalog || []) as CatalogService[];
  const message = params?.status ? statusMessages[params.status] : null;

  return (
    <>
      <PageHeader
        area="Cadastros / Servicos"
        title="Servicos"
        description={`Catalogo e atendimentos do segmento ${segmentLabels[segment]}.`}
        action={view === "catalogo"
          ? <a className="primary-button button-link" href="/cadastros/servicos/novo">Novo servico</a>
          : <a className="primary-button button-link" href="/cadastros/servicos/atendimentos/novo">Novo atendimento</a>}
      />
      {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
      <nav className="report-tabs" aria-label="Visoes de servicos">
        <a className={view === "catalogo" ? "active" : ""} href="/cadastros/servicos?view=catalogo">Catalogo</a>
        <a className={view === "atendimentos" ? "active" : ""} href="/cadastros/servicos?view=atendimentos">Atendimentos</a>
      </nav>
      {view === "catalogo" ? (
        <section className="table-panel">
          <h2>Servicos prontos</h2>
          <div className="table-wrap"><table>
            <thead><tr><th>Servico</th><th>Categoria</th><th>Tipo</th><th>Preco</th><th>Status</th><th>Acoes</th></tr></thead>
            <tbody>{allCatalog.length ? allCatalog.map((service) => (
              <tr key={service.id}>
                <td><strong>{service.name}</strong><div className="muted">{service.code || service.description || "Sem codigo"}</div></td>
                <td>{service.category || "-"}</td><td>{typeOptions.find((item) => item.value === service.service_type)?.label || service.service_type}</td><td>{formatMoney(service.sale_price)}</td>
                <td><span className={`badge ${service.active ? "success" : ""}`}>{service.active ? "ativo" : "inativo"}</span></td>
                <td><CatalogServiceActions service={{ id: service.id, code: service.code, name: service.name, description: service.description, category: service.category, serviceType: service.service_type, salePrice: service.sale_price, fiscalServiceData: service.fiscal_service_data, notes: service.notes, active: service.active }} typeOptions={typeOptions} /></td>
              </tr>
            )) : <tr><td colSpan={6}>Nenhum servico pronto cadastrado.</td></tr>}</tbody>
          </table></div>
        </section>
      ) : (
        <section className="table-panel">
          <h2>Atendimentos cadastrados</h2>
          <div className="table-wrap"><table>
            <thead><tr><th>Cliente</th><th>Servico</th><th>Tipo</th><th>Valor</th><th>Data</th><th>Detalhes</th><th>Status</th><th>Acoes</th></tr></thead>
            <tbody>{allServices.length ? allServices.map((service) => (
              <tr key={service.id}>
                <td>{getClient(service)?.legal_name || "-"}</td><td>{service.service_description}</td><td>{service.service_type}</td><td>{formatMoney(service.amount)}</td><td>{formatDate(service.service_date)}</td><td>{detailsSummary(service) || "-"}</td><td><span className="badge warning">{service.status}</span></td>
                <td><div className="table-actions"><a className="ghost-button button-link compact-button" href={`/cadastros/servicos/atendimentos/${service.id}/editar`}>Evoluir</a><form action="/api/cadastros/servicos" method="post"><input type="hidden" name="action" value="delete" /><input type="hidden" name="serviceId" value={service.id} /><DeleteServiceButton disabled={!canDeleteServiceStatus(service.status)} /></form></div></td>
              </tr>
            )) : <tr><td colSpan={8}>Nenhum atendimento cadastrado.</td></tr>}</tbody>
          </table></div>
        </section>
      )}
    </>
  );
}
