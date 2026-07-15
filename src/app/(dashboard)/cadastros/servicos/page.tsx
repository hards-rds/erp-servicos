import { PageHeader } from "@/components/layout/page-header";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ServicosPageProps = {
  searchParams?: Promise<{ status?: string }>;
};

type ServiceRecord = {
  id: string;
  service_description: string;
  service_type: string;
  amount: number | string;
  service_date: string;
  due_date: string | null;
  status: string;
  clients: {
    legal_name: string;
    document: string;
  } | {
    legal_name: string;
    document: string;
  }[] | null;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  created: { kind: "success", text: "Servico cadastrado com sucesso." },
  invalid: { kind: "error", text: "Revise cliente, descricao e valor antes de salvar." },
  error: { kind: "error", text: "Nao foi possivel cadastrar o servico agora." },
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." }
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function getServiceClient(service: ServiceRecord) {
  return Array.isArray(service.clients) ? service.clients[0] : service.clients;
}

export default async function ServicosPage({ searchParams }: ServicosPageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id,legal_name,document,status")
    .eq("status", "ativo")
    .order("legal_name", { ascending: true });
  const { data: services } = await supabase
    .from("service_records")
    .select("id,service_description,service_type,amount,service_date,due_date,status,clients(legal_name,document)")
    .order("service_date", { ascending: false })
    .limit(50);
  const message = params?.status ? statusMessages[params.status] : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        area="Cadastros / Servicos"
        title="Servicos"
        description="Servicos avulsos ou esporadicos atrelados a um cliente cadastrado."
        action={<a className="primary-button button-link" href="/cadastros/clientes">Novo cliente</a>}
      />
      {message ? (
        <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div>
      ) : null}
      <div className="two-columns">
        <section className="table-panel">
          <h2>Servicos cadastrados</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Servico</th>
                  <th>Tipo</th>
                  <th>Valor</th>
                  <th>Data</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {services?.length ? (
                  (services as ServiceRecord[]).map((service) => {
                    const client = getServiceClient(service);
                    return (
                      <tr key={service.id}>
                        <td>{client?.legal_name || "-"}</td>
                        <td>{service.service_description}</td>
                        <td>{service.service_type}</td>
                        <td>{formatMoney(service.amount)}</td>
                        <td>{formatDate(service.service_date)}</td>
                        <td><span className="badge warning">{service.status}</span></td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6}>Nenhum servico cadastrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="form-panel">
          <h2>Novo servico</h2>
          <form className="form-stack" action="/api/cadastros/servicos" method="post">
            <label>
              Cliente
              <select name="clientId" required defaultValue="">
                <option value="" disabled>Selecione um cliente</option>
                {clients?.map((client) => (
                  <option key={client.id} value={client.id}>{client.legal_name}</option>
                ))}
              </select>
            </label>
            {!clients?.length ? (
              <div className="form-error">Cadastre um cliente antes de criar o servico.</div>
            ) : null}
            <label>
              Descricao do servico
              <input name="serviceDescription" placeholder="Ex.: Atendimento tecnico avulso" required />
            </label>
            <div className="form-grid">
              <label>
                Tipo
                <select name="serviceType" defaultValue="avulso">
                  <option value="avulso">Avulso</option>
                  <option value="implantacao">Implantacao</option>
                  <option value="suporte">Suporte</option>
                  <option value="consultoria">Consultoria</option>
                  <option value="recorrente">Recorrente</option>
                </select>
              </label>
              <label>
                Valor
                <input name="amount" inputMode="decimal" placeholder="0,00" required />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Data do servico
                <input name="serviceDate" type="date" defaultValue={today} required />
              </label>
              <label>
                Vencimento
                <input name="dueDate" type="date" />
              </label>
            </div>
            <label>
              Status
              <select name="status" defaultValue="rascunho">
                <option value="rascunho">Rascunho</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluido">Concluido</option>
                <option value="faturado">Faturado</option>
              </select>
            </label>
            <label>
              Observacoes
              <textarea name="notes" placeholder="Detalhes internos sobre este atendimento" />
            </label>
            <button className="primary-button" type="submit" disabled={!clients?.length}>Criar servico</button>
          </form>
        </section>
      </div>
    </>
  );
}
