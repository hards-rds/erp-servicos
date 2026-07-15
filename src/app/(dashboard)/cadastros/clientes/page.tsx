import { PageHeader } from "@/components/layout/page-header";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ClientForm } from "./client-form";

type ClientesPageProps = {
  searchParams?: Promise<{ status?: string }>;
};

type ClientAddress = {
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
  zipCode?: string;
};

type ClientRow = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  document: string;
  municipal_registration: string | null;
  state_registration: string | null;
  fiscal_email: string | null;
  financial_email: string | null;
  phone: string | null;
  address: ClientAddress | null;
  internal_notes: string | null;
  status: string;
  created_at: string;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  created: { kind: "success", text: "Cliente cadastrado com sucesso." },
  updated: { kind: "success", text: "Cliente atualizado com sucesso." },
  deleted: { kind: "success", text: "Cliente excluido com sucesso." },
  duplicate: { kind: "error", text: "Ja existe um cliente com esse CPF/CNPJ." },
  invalid: { kind: "error", text: "Revise CPF/CNPJ e nome antes de salvar." },
  invalid_delete: { kind: "error", text: "Nao foi possivel identificar o cliente para excluir." },
  delete_linked: { kind: "error", text: "Este cliente tem vinculos em servicos, contratos ou financeiro e nao pode ser excluido." },
  delete_error: { kind: "error", text: "Nao foi possivel excluir o cliente agora." },
  update_error: { kind: "error", text: "Nao foi possivel atualizar o cliente agora." },
  error: { kind: "error", text: "Nao foi possivel cadastrar o cliente agora." },
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." }
};

function formatDocument(value: string) {
  if (value.length === 11) {
    return value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  return value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

export default async function ClientesPage({ searchParams }: ClientesPageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id,legal_name,trade_name,document,municipal_registration,state_registration,fiscal_email,financial_email,phone,address,internal_notes,status,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  const message = params?.status ? statusMessages[params.status] : null;
  const allClients = (clients || []) as ClientRow[];

  return (
    <>
      <PageHeader
        area="Cadastros / Clientes"
        title="Clientes"
        description="Cadastro fiscal, financeiro e contatos de clientes recorrentes ou esporadicos."
        action={<a className="primary-button button-link" href="/cadastros/servicos">Criar servico</a>}
      />
      {message ? (
        <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div>
      ) : null}
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
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {allClients.length ? (
                  allClients.map((client) => (
                    <tr key={client.id}>
                      <td>
                        <strong>{client.legal_name}</strong>
                        {client.trade_name ? <div className="muted">{client.trade_name}</div> : null}
                      </td>
                      <td>{formatDocument(client.document)}</td>
                      <td>{client.fiscal_email || "-"}</td>
                      <td><span className="badge success">{client.status}</span></td>
                      <td>
                        <div className="row-actions">
                          <a className="ghost-button button-link compact-button" href={`#editar-${client.id}`}>Editar</a>
                          <form action="/api/cadastros/clientes" method="post">
                            <input type="hidden" name="action" value="delete" />
                            <input type="hidden" name="clientId" value={client.id} />
                            <button className="danger-button compact-button" type="submit">Excluir</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>Nenhum cliente cadastrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="form-panel">
          <h2>Novo cliente</h2>
          <ClientForm />
        </section>
      </div>
      <section className="table-panel">
        <h2>Editar clientes</h2>
        <div className="settings-list">
          {allClients.length ? (
            allClients.map((client) => (
              <details className="details-panel" id={`editar-${client.id}`} key={client.id}>
                <summary>
                  <span>
                    <strong>{client.legal_name}</strong>
                    <span className="muted">{formatDocument(client.document)}</span>
                  </span>
                </summary>
                <ClientForm
                  action="update"
                  submitLabel="Salvar cliente"
                  initialValues={{
                    id: client.id,
                    document: client.document,
                    legalName: client.legal_name,
                    tradeName: client.trade_name || "",
                    phone: client.phone || "",
                    fiscalEmail: client.fiscal_email || "",
                    financialEmail: client.financial_email || "",
                    municipalRegistration: client.municipal_registration || "",
                    stateRegistration: client.state_registration || "",
                    internalNotes: client.internal_notes || "",
                    address: client.address || {}
                  }}
                />
              </details>
            ))
          ) : (
            <div className="muted">Nenhum cliente para editar.</div>
          )}
        </div>
      </section>
    </>
  );
}
