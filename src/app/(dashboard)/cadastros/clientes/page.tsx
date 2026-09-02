import { PageHeader } from "@/components/layout/page-header";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ClientesPageProps = { searchParams?: Promise<{ status?: string; page?: string; q?: string; sort?: string; dir?: string }> };
type ClientRow = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  document: string;
  fiscal_email: string | null;
  phone: string | null;
  status: string;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  created: { kind: "success", text: "Cliente cadastrado com sucesso." },
  updated: { kind: "success", text: "Cliente atualizado com sucesso." },
  deleted: { kind: "success", text: "Cliente excluido com sucesso." },
  optical_created: { kind: "success", text: "Registro optico salvo no historico do cliente." },
  duplicate: { kind: "error", text: "Ja existe um cliente com esse CPF/CNPJ." },
  plan_limit: { kind: "error", text: "O limite de clientes do plano foi atingido. Consulte Assinatura e plano." },
  invalid: { kind: "error", text: "Revise CPF/CNPJ e nome antes de salvar." },
  cnpj_lookup_error: { kind: "error", text: "Nao foi possivel validar o CNPJ na base cadastral. Tente novamente antes de salvar." },
  optical_invalid: { kind: "error", text: "Revise cliente e data antes de salvar o registro optico." },
  optical_error: { kind: "error", text: "Nao foi possivel salvar o registro optico agora." },
  invalid_delete: { kind: "error", text: "Nao foi possivel identificar o cliente para excluir." },
  delete_not_found: { kind: "error", text: "Cliente nao encontrado na empresa ativa ou ja excluido." },
  delete_linked: { kind: "error", text: "Este cliente tem vinculos em servicos, contratos ou financeiro e nao pode ser excluido." },
  delete_error: { kind: "error", text: "Nao foi possivel excluir o cliente agora." },
  update_error: { kind: "error", text: "Nao foi possivel atualizar o cliente agora." },
  error: { kind: "error", text: "Nao foi possivel cadastrar o cliente agora." },
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." }
};

const clientsPerPage = 50;
const clientSortColumns = {
  name: "legal_name",
  document: "document",
  email: "fiscal_email",
  phone: "phone",
  status: "status"
} as const;
type ClientSortKey = keyof typeof clientSortColumns;

function clientsPageUrl(page: number, search: string, sort: ClientSortKey, direction: "asc" | "desc") {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (sort !== "name") params.set("sort", sort);
  if (direction !== "asc") params.set("dir", direction);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/cadastros/clientes${query ? `?${query}` : ""}`;
}

function safeSearchTerm(value: string) {
  return value.replace(/[^\p{L}\p{N}\s@._-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function formatDocument(value: string) {
  if (value.startsWith("LEGADO-")) return "Nao informado";
  if (value.length === 11) return value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (value.length === 14) return value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return value || "Nao informado";
}

export default async function ClientesPage({ searchParams }: ClientesPageProps) {
  const params = await searchParams;
  const requestedPage = Math.max(1, Number.parseInt(params?.page || "1", 10) || 1);
  const search = safeSearchTerm(params?.q || "");
  const sort = (params?.sort && params.sort in clientSortColumns ? params.sort : "name") as ClientSortKey;
  const direction = params?.dir === "desc" ? "desc" : "asc";
  const rangeStart = (requestedPage - 1) * clientsPerPage;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };
  const { data: company } = profile?.company_id
    ? await supabase.from("companies").select("service_segment").eq("id", profile.company_id).maybeSingle()
    : { data: null };

  let clientsQuery = profile?.company_id
    ? supabase
      .from("clients")
      .select("id,legal_name,trade_name,document,fiscal_email,phone,status", { count: "exact" })
      .eq("company_id", profile.company_id)
    : null;

  if (clientsQuery && search) {
    clientsQuery = clientsQuery.or(`legal_name.ilike.%${search}%,trade_name.ilike.%${search}%,document.ilike.%${search.replace(/\D/g, "") || search}%`);
  }

  const { data: clients, count: totalClients } = clientsQuery
    ? await clientsQuery
      .order(clientSortColumns[sort], { ascending: direction === "asc", nullsFirst: false })
      .range(rangeStart, rangeStart + clientsPerPage - 1)
    : { data: [], count: 0 };
  const allClients = (clients || []) as ClientRow[];
  const clientIds = allClients.map((client) => client.id);
  const { data: opticalRecords } = company?.service_segment === "otica" && clientIds.length
    ? await supabase
      .from("client_optical_records")
      .select("client_id")
      .eq("company_id", profile?.company_id || "")
      .in("client_id", clientIds)
    : { data: [] };
  const clientsWithPrescription = new Set((opticalRecords || []).map((record) => record.client_id));
  const total = totalClients || 0;
  const totalPages = Math.max(1, Math.ceil(total / clientsPerPage));
  const firstVisible = total ? rangeStart + 1 : 0;
  const lastVisible = Math.min(rangeStart + allClients.length, total);
  const message = params?.status ? statusMessages[params.status] : null;

  return (
    <>
      <PageHeader
        area="Cadastros / Clientes"
        title="Clientes"
        description="Cadastro fiscal, financeiro e contatos de clientes recorrentes ou esporadicos."
        action={<a className="primary-button button-link" href="/cadastros/clientes/novo">Novo cliente</a>}
      />
      {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
      <section className="table-panel">
        <div className="table-panel-heading">
          <div>
            <h2>Clientes cadastrados</h2>
            <span className="list-count">{new Intl.NumberFormat("pt-BR").format(total)} {total === 1 ? "cliente" : "clientes"}</span>
          </div>
          <form className={`list-search${search ? "" : " single-action"}`} action="/cadastros/clientes" method="get">
            <input type="hidden" name="sort" value={sort} />
            <input type="hidden" name="dir" value={direction} />
            <label className="sr-only" htmlFor="client-search">Buscar cliente</label>
            <input id="client-search" name="q" type="search" defaultValue={search} placeholder="Buscar por nome, CPF ou CNPJ" />
            <button className="ghost-button" type="submit">Buscar</button>
            {search ? <a className="ghost-button button-link" href="/cadastros/clientes">Limpar</a> : null}
          </form>
        </div>
        <div className="table-wrap">
          <table data-server-sort="true" data-sort-key="clients" data-sort-column={sort} data-sort-direction={direction === "asc" ? "ascending" : "descending"}>
            <thead><tr><th data-sort-key="name">Nome/Razao social</th><th data-sort-key="document">CPF/CNPJ</th><th data-sort-key="email">E-mail fiscal</th><th data-sort-key="phone">Telefone</th>{company?.service_segment === "otica" ? <th data-sortable="false">Receita</th> : null}<th data-sort-key="status">Status</th><th>Acoes</th></tr></thead>
            <tbody>
              {allClients.length ? allClients.map((client) => (
                <tr key={client.id}>
                  <td><strong>{client.legal_name}</strong>{client.trade_name ? <div className="muted">{client.trade_name}</div> : null}</td>
                  <td>{formatDocument(client.document)}</td>
                  <td>{client.fiscal_email || "-"}</td>
                  <td>{client.phone || "-"}</td>
                  {company?.service_segment === "otica" ? <td>{clientsWithPrescription.has(client.id) ? <span className="badge success">Cadastrada</span> : <span className="badge">Nao cadastrada</span>}</td> : null}
                  <td><span className="badge success">{client.status}</span></td>
                  <td>
                    <RowActionsMenu label={`Acoes do cliente ${client.legal_name}`}>
                      <a className="ghost-button button-link compact-button" href={`/cadastros/clientes/${client.id}/editar`}>{company?.service_segment === "otica" ? "Editar / ver receita" : "Editar"}</a>
                      <form action="/api/cadastros/clientes" method="post">
                        <input type="hidden" name="action" value="delete" />
                        <input type="hidden" name="clientId" value={client.id} />
                        <button className="danger-button compact-button" type="submit">Excluir</button>
                      </form>
                    </RowActionsMenu>
                  </td>
                </tr>
              )) : <tr><td colSpan={company?.service_segment === "otica" ? 7 : 6}>{search ? "Nenhum cliente encontrado para esta busca." : "Nenhum cliente cadastrado."}</td></tr>}
            </tbody>
          </table>
        </div>
        <nav className="pagination" aria-label="Paginacao de clientes">
          <span className="pagination-summary">Exibindo {new Intl.NumberFormat("pt-BR").format(firstVisible)}-{new Intl.NumberFormat("pt-BR").format(lastVisible)} de {new Intl.NumberFormat("pt-BR").format(total)}</span>
          <div className="pagination-actions">
            {requestedPage > 1 ? <a className="ghost-button button-link compact-button" href={clientsPageUrl(requestedPage - 1, search, sort, direction)}>Anterior</a> : <span className="ghost-button compact-button disabled-control">Anterior</span>}
            <span className="pagination-page">Pagina {Math.min(requestedPage, totalPages)} de {totalPages}</span>
            {requestedPage < totalPages ? <a className="ghost-button button-link compact-button" href={clientsPageUrl(requestedPage + 1, search, sort, direction)}>Proxima</a> : <span className="ghost-button compact-button disabled-control">Proxima</span>}
          </div>
        </nav>
      </section>
    </>
  );
}
