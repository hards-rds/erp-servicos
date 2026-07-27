import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ContratosPageProps = {
  searchParams?: Promise<{ status?: string }>;
};

type ClientRow = {
  id: string;
  legal_name: string;
};

type ContractRow = {
  id: string;
  service_description: string;
  recurring_amount: number | string;
  periodicity: string;
  due_day: number;
  status: string;
  auto_issue_nfse: boolean;
  auto_generate_charge: boolean;
  clients: { legal_name: string } | { legal_name: string }[] | null;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  created: { kind: "success", text: "Contrato cadastrado com sucesso." },
  created_generated: { kind: "success", text: "Contrato cadastrado e fluxo da competencia atual gerado." },
  generated: { kind: "success", text: "Fluxo da competencia atual gerado/atualizado." },
  created_flow_error: { kind: "error", text: "Contrato criado, mas houve falha ao gerar o fluxo automatico." },
  generate_error: { kind: "error", text: "Nao foi possivel gerar o fluxo deste contrato." },
  inactive: { kind: "error", text: "Somente contratos ativos geram fluxo recorrente." },
  invalid: { kind: "error", text: "Revise cliente, servico, valor e dia de vencimento." },
  error: { kind: "error", text: "Nao foi possivel cadastrar o contrato agora." },
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." }
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getClientName(contract: ContractRow) {
  const client = Array.isArray(contract.clients) ? contract.clients[0] : contract.clients;
  return client?.legal_name || "-";
}

export default async function ContratosPage({ searchParams }: ContratosPageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id,legal_name")
    .eq("status", "ativo")
    .order("legal_name", { ascending: true });
  const { data: contracts } = await supabase
    .from("contracts")
    .select("id,service_description,recurring_amount,periodicity,due_day,status,auto_issue_nfse,auto_generate_charge,clients(legal_name)")
    .order("created_at", { ascending: false })
    .limit(50);
  const allClients = (clients || []) as ClientRow[];
  const allContracts = (contracts || []) as ContractRow[];
  const message = params?.status ? statusMessages[params.status] : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        area="Cadastros / Contratos"
        title="Contratos recorrentes"
        description="Base de recorrencia financeira, fiscal e de cobrancas."
        action={<a className="primary-button button-link" href="/cadastros/clientes">Novo cliente</a>}
      />
      {message ? (
        <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div>
      ) : null}
      <div className="two-columns">
        <section className="table-panel">
          <h2>Contratos</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Servico</th>
                  <th>Valor</th>
                  <th>Vencimento</th>
                  <th>Automacoes</th>
                  <th>Status</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {allContracts.length ? (
                  allContracts.map((contract) => (
                    <tr key={contract.id}>
                      <td>{getClientName(contract)}</td>
                      <td>{contract.service_description}</td>
                      <td>{formatMoney(contract.recurring_amount)}</td>
                      <td>Dia {contract.due_day}</td>
                      <td>
                        {contract.auto_issue_nfse ? "NFS-e" : ""}
                        {contract.auto_issue_nfse && contract.auto_generate_charge ? " + " : ""}
                        {contract.auto_generate_charge ? "Boleto Inter" : ""}
                        {!contract.auto_issue_nfse && !contract.auto_generate_charge ? "-" : ""}
                      </td>
                      <td><StatusBadge tone={contract.status === "ativo" ? "success" : "neutral"}>{contract.status}</StatusBadge></td>
                      <td>
                        <form action="/api/cadastros/contratos" method="post">
                          <input type="hidden" name="action" value="generate" />
                          <input type="hidden" name="contractId" value={contract.id} />
                          <button className="ghost-button compact-button" type="submit">Gerar fluxo</button>
                        </form>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7}>Nenhum contrato cadastrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="form-panel">
          <h2>Novo contrato recorrente</h2>
          <form className="form-stack" action="/api/cadastros/contratos" method="post">
            <input type="hidden" name="action" value="create" />
            <label>
              Cliente
              <select name="clientId" required defaultValue="">
                <option value="" disabled>Selecione um cliente</option>
                {allClients.map((client) => (
                  <option key={client.id} value={client.id}>{client.legal_name}</option>
                ))}
              </select>
            </label>
            {!allClients.length ? <div className="form-error">Cadastre um cliente antes de criar o contrato.</div> : null}
            <label>
              Servico recorrente
              <input name="serviceDescription" placeholder="Ex.: Suporte mensal / mensalidade" required />
            </label>
            <div className="form-grid">
              <label>
                Valor mensal
                <input name="recurringAmount" inputMode="decimal" placeholder="0,00" required />
              </label>
              <label>
                Dia de vencimento
                <input name="dueDay" type="number" min={1} max={31} defaultValue={10} required />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Periodicidade
                <select name="periodicity" defaultValue="mensal">
                  <option value="mensal">Mensal</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="semestral">Semestral</option>
                  <option value="anual">Anual</option>
                </select>
              </label>
              <label>
                Inicio
                <input name="startsAt" type="date" defaultValue={today} required />
              </label>
            </div>
            <label>
              Status
              <select name="status" defaultValue="ativo">
                <option value="ativo">Ativo</option>
                <option value="rascunho">Rascunho</option>
                <option value="suspenso">Suspenso</option>
              </select>
            </label>
            <fieldset className="checkbox-panel">
              <legend>Automacoes ao gerar fluxo</legend>
              <label className="checkbox-row">
                <input type="checkbox" name="autoIssueNfse" defaultChecked />
                <span>Emitir/gerar fila de NFS-e automaticamente</span>
              </label>
              <label className="checkbox-row">
                <input type="checkbox" name="autoGenerateCharge" defaultChecked />
                <span>Gerar boleto/cobranca Banco Inter automaticamente</span>
              </label>
            </fieldset>
            <fieldset className="checkbox-panel">
              <legend>Dados fiscais para NFS-e Nacional</legend>
              <div className="form-grid">
                <label>
                  Ambiente NFS-e
                  <select name="nfseEnvironment" defaultValue="homologation">
                    <option value="homologation">Homologacao</option>
                    <option value="production">Producao</option>
                  </select>
                </label>
                <label>
                  Serie DPS
                  <input name="series" defaultValue="1" />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Codigo IBGE municipio
                  <input name="cityCode" placeholder="Ex.: 3106200" />
                </label>
                <label>
                  Inscricao municipal emitente
                  <input name="municipalRegistration" placeholder="Inscricao municipal" />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Codigo nacional do servico
                  <input name="serviceCode" placeholder="Ex.: 010701" />
                </label>
                <label>
                  Codigo municipal do servico
                  <input name="municipalServiceCode" placeholder="Ex.: 001" />
                </label>
              </div>
              <div className="form-grid">
                <label className="checkbox-row">
                  <input type="checkbox" name="simpleNational" />
                  <span>Emitente optante pelo Simples Nacional</span>
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" name="retainIss" />
                  <span>Reter ISSQN</span>
                </label>
              </div>
            </fieldset>
            <label>
              Observacoes
              <textarea name="notes" placeholder="Regras comerciais, escopo e observacoes internas" />
            </label>
            <button className="primary-button" type="submit" disabled={!allClients.length}>Criar contrato e gerar fluxo</button>
          </form>
        </section>
      </div>
    </>
  );
}
