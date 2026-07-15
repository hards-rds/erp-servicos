import { PageHeader } from "@/components/layout/page-header";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ClientForm } from "./client-form";

type ClientesPageProps = {
  searchParams?: Promise<{ status?: string }>;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  created: { kind: "success", text: "Cliente cadastrado com sucesso." },
  duplicate: { kind: "error", text: "Ja existe um cliente com esse CPF/CNPJ." },
  invalid: { kind: "error", text: "Revise CPF/CNPJ e nome antes de salvar." },
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
    .select("id,legal_name,trade_name,document,fiscal_email,status,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  const message = params?.status ? statusMessages[params.status] : null;

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
                </tr>
              </thead>
              <tbody>
                {clients?.length ? (
                  clients.map((client) => (
                    <tr key={client.id}>
                      <td>
                        <strong>{client.legal_name}</strong>
                        {client.trade_name ? <div className="muted">{client.trade_name}</div> : null}
                      </td>
                      <td>{formatDocument(client.document)}</td>
                      <td>{client.fiscal_email || "-"}</td>
                      <td><span className="badge success">{client.status}</span></td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>Nenhum cliente cadastrado.</td>
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
    </>
  );
}
