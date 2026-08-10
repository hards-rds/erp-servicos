import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ContratosPageProps = {
  searchParams?: Promise<{ status?: string; edit?: string }>;
};

type ClientRow = {
  id: string;
  legal_name: string;
};

type ContractRow = {
  id: string;
  client_id: string;
  service_description: string;
  recurring_amount: number | string;
  periodicity: string;
  due_day: number;
  starts_at: string;
  status: string;
  auto_issue_nfse: boolean;
  auto_generate_charge: boolean;
  fiscal_service_data: Record<string, unknown> | null;
  notes: string | null;
  clients: { legal_name: string } | { legal_name: string }[] | null;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  created: { kind: "success", text: "Contrato cadastrado com sucesso." },
  created_generated: { kind: "success", text: "Contrato cadastrado e fluxo da competencia atual gerado." },
  generated: { kind: "success", text: "Fluxo da competencia atual gerado/atualizado." },
  updated: { kind: "success", text: "Contrato atualizado. A nota rejeitada ja pode ser processada novamente." },
  created_flow_error: { kind: "error", text: "Contrato criado, mas houve falha ao gerar o fluxo automatico." },
  generate_error: { kind: "error", text: "Nao foi possivel gerar o fluxo deste contrato." },
  inactive: { kind: "error", text: "Somente contratos ativos geram fluxo recorrente." },
  fiscal_invalid: {
    kind: "error",
    text: "Para emitir NFS-e, informe o codigo IBGE do municipio com 7 digitos e o codigo nacional do servico com 6 digitos."
  },
  invalid: { kind: "error", text: "Revise cliente, servico, valor e dia de vencimento." },
  error: { kind: "error", text: "Nao foi possivel cadastrar o contrato agora." },
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." }
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatMoneyInput(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fiscalString(data: Record<string, unknown> | null | undefined, key: string, fallback = "") {
  const value = data?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function fiscalBoolean(data: Record<string, unknown> | null | undefined, key: string) {
  return data?.[key] === true;
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
    .select("id,client_id,service_description,recurring_amount,periodicity,due_day,starts_at,status,auto_issue_nfse,auto_generate_charge,fiscal_service_data,notes,clients(legal_name)")
    .order("created_at", { ascending: false })
    .limit(50);
  const allClients = (clients || []) as ClientRow[];
  const allContracts = (contracts || []) as ContractRow[];
  const editingContract = params?.edit ? allContracts.find((contract) => contract.id === params.edit) : undefined;
  const editingFiscal = editingContract?.fiscal_service_data;
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
                        <div className="table-actions">
                          <a
                            className="ghost-button button-link compact-button"
                            href={`/cadastros/contratos?edit=${contract.id}`}
                          >
                            Editar
                          </a>
                          <form action="/api/cadastros/contratos" method="post">
                            <input type="hidden" name="action" value="generate" />
                            <input type="hidden" name="contractId" value={contract.id} />
                            <button className="ghost-button compact-button" type="submit">Gerar fluxo</button>
                          </form>
                        </div>
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
          <h2>{editingContract ? "Editar contrato recorrente" : "Novo contrato recorrente"}</h2>
          <form className="form-stack" action="/api/cadastros/contratos" method="post">
            <input type="hidden" name="action" value={editingContract ? "update" : "create"} />
            {editingContract ? <input type="hidden" name="contractId" value={editingContract.id} /> : null}
            <label>
              Cliente
              <select name="clientId" required defaultValue={editingContract?.client_id || ""}>
                <option value="" disabled>Selecione um cliente</option>
                {allClients.map((client) => (
                  <option key={client.id} value={client.id}>{client.legal_name}</option>
                ))}
              </select>
            </label>
            {!allClients.length ? <div className="form-error">Cadastre um cliente antes de criar o contrato.</div> : null}
            <label>
              Servico recorrente
              <input
                name="serviceDescription"
                placeholder="Ex.: Suporte mensal / mensalidade"
                defaultValue={editingContract?.service_description}
                required
              />
            </label>
            <div className="form-grid">
              <label>
                Valor mensal
                <input
                  name="recurringAmount"
                  inputMode="decimal"
                  placeholder="0,00"
                  defaultValue={editingContract ? formatMoneyInput(editingContract.recurring_amount) : undefined}
                  required
                />
              </label>
              <label>
                Dia de vencimento
                <input name="dueDay" type="number" min={1} max={31} defaultValue={editingContract?.due_day || 10} required />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Periodicidade
                <select name="periodicity" defaultValue={editingContract?.periodicity || "mensal"}>
                  <option value="mensal">Mensal</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="semestral">Semestral</option>
                  <option value="anual">Anual</option>
                </select>
              </label>
              <label>
                Inicio
                <input name="startsAt" type="date" defaultValue={editingContract?.starts_at || today} required />
              </label>
            </div>
            <label>
              Status
              <select name="status" defaultValue={editingContract?.status || "ativo"}>
                <option value="ativo">Ativo</option>
                <option value="rascunho">Rascunho</option>
                <option value="suspenso">Suspenso</option>
              </select>
            </label>
            <fieldset className="checkbox-panel">
              <legend>Automacoes ao gerar fluxo</legend>
              <label className="checkbox-row">
                <input type="checkbox" name="autoIssueNfse" defaultChecked={editingContract?.auto_issue_nfse ?? true} />
                <span>Emitir/gerar fila de NFS-e automaticamente</span>
              </label>
              <label className="checkbox-row">
                <input type="checkbox" name="autoGenerateCharge" defaultChecked={editingContract?.auto_generate_charge ?? true} />
                <span>Gerar boleto/cobranca Banco Inter automaticamente</span>
              </label>
            </fieldset>
            <fieldset className="checkbox-panel">
              <legend>Dados fiscais para NFS-e Nacional</legend>
              <div className="form-grid">
                <label>
                  Ambiente NFS-e
                  <select name="nfseEnvironment" defaultValue={fiscalString(editingFiscal, "environment", "homologation")}>
                    <option value="homologation">Homologacao</option>
                    <option value="production">Producao</option>
                  </select>
                </label>
                <label>
                  Serie DPS
                  <input name="series" defaultValue={fiscalString(editingFiscal, "series", "1")} />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Codigo IBGE municipio
                  <input
                    name="cityCode"
                    inputMode="numeric"
                    maxLength={7}
                    placeholder="Ex.: 3106200"
                    defaultValue={fiscalString(editingFiscal, "cityCode")}
                  />
                </label>
                <label>
                  Inscricao municipal emitente
                  <input
                    name="municipalRegistration"
                    placeholder="Inscricao municipal"
                    defaultValue={fiscalString(editingFiscal, "municipalRegistration")}
                  />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Codigo nacional do servico
                  <input
                    name="serviceCode"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="Ex.: 010701"
                    defaultValue={fiscalString(editingFiscal, "serviceCode")}
                  />
                </label>
                <label>
                  Codigo municipal do servico
                  <input
                    name="municipalServiceCode"
                    placeholder="Ex.: 001"
                    defaultValue={fiscalString(editingFiscal, "municipalServiceCode")}
                  />
                </label>
              </div>
              <div className="form-grid">
                <label className="checkbox-row">
                  <input type="checkbox" name="simpleNational" defaultChecked={fiscalBoolean(editingFiscal, "simpleNational")} />
                  <span>Emitente optante pelo Simples Nacional</span>
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" name="retainIss" defaultChecked={fiscalBoolean(editingFiscal, "retainIss")} />
                  <span>Reter ISSQN</span>
                </label>
              </div>
            </fieldset>
            <label>
              Observacoes
              <textarea
                name="notes"
                placeholder="Regras comerciais, escopo e observacoes internas"
                defaultValue={editingContract?.notes || ""}
              />
            </label>
            <div className="table-actions">
              <button className="primary-button" type="submit" disabled={!allClients.length}>
                {editingContract ? "Salvar contrato" : "Criar contrato e gerar fluxo"}
              </button>
              {editingContract ? (
                <a className="ghost-button button-link" href="/cadastros/contratos">Cancelar</a>
              ) : null}
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
