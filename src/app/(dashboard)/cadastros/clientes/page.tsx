import { PageHeader } from "@/components/layout/page-header";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ClientesPageProps = { searchParams?: Promise<{ status?: string }> };
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
  invalid: { kind: "error", text: "Revise CPF/CNPJ e nome antes de salvar." },
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

function formatDocument(value: string) {
  if (value.startsWith("LEGADO-")) return "Nao informado";
  if (value.length === 11) return value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (value.length === 14) return value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return value || "Nao informado";
}

export default async function ClientesPage({ searchParams }: ClientesPageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };
  const { data: clients } = profile?.company_id
    ? await supabase
      .from("clients")
      .select("id,legal_name,trade_name,document,fiscal_email,phone,status")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false })
      .limit(100)
    : { data: [] };
  const allClients = (clients || []) as ClientRow[];
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
        <h2>Clientes cadastrados</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nome/Razao social</th><th>CPF/CNPJ</th><th>E-mail fiscal</th><th>Telefone</th><th>Status</th><th>Acoes</th></tr></thead>
            <tbody>
              {allClients.length ? allClients.map((client) => (
                <tr key={client.id}>
                  <td><strong>{client.legal_name}</strong>{client.trade_name ? <div className="muted">{client.trade_name}</div> : null}</td>
                  <td>{formatDocument(client.document)}</td>
                  <td>{client.fiscal_email || "-"}</td>
                  <td>{client.phone || "-"}</td>
                  <td><span className="badge success">{client.status}</span></td>
                  <td>
                    <RowActionsMenu label={`Acoes do cliente ${client.legal_name}`}>
                      <a className="ghost-button button-link compact-button" href={`/cadastros/clientes/${client.id}/editar`}>Editar</a>
                      <form action="/api/cadastros/clientes" method="post">
                        <input type="hidden" name="action" value="delete" />
                        <input type="hidden" name="clientId" value={client.id} />
                        <button className="danger-button compact-button" type="submit">Excluir</button>
                      </form>
                    </RowActionsMenu>
                  </td>
                </tr>
              )) : <tr><td colSpan={6}>Nenhum cliente cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
