type ClientOption = {
  id: string;
  legal_name: string;
};

export type ContractFormValue = {
  id: string;
  client_id: string;
  service_description: string;
  recurring_amount: number | string;
  periodicity: string;
  due_day: number;
  starts_at: string;
  status: string;
  fiscal_service_data: Record<string, unknown> | null;
  notes: string | null;
};

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

export function ContractForm({
  clients,
  contract
}: {
  clients: ClientOption[];
  contract?: ContractFormValue;
}) {
  const fiscal = contract?.fiscal_service_data;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form className="form-stack" action="/api/cadastros/contratos" method="post">
      <input type="hidden" name="action" value={contract ? "update" : "create"} />
      {contract ? <input type="hidden" name="contractId" value={contract.id} /> : null}
      <label>
        Cliente
        <select name="clientId" required defaultValue={contract?.client_id || ""}>
          <option value="" disabled>Selecione um cliente</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>{client.legal_name}</option>
          ))}
        </select>
      </label>
      {!clients.length ? <div className="form-error">Cadastre um cliente antes de criar o contrato.</div> : null}
      <label>
        Servico recorrente
        <input
          name="serviceDescription"
          placeholder="Ex.: Suporte mensal / mensalidade"
          defaultValue={contract?.service_description}
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
            defaultValue={contract ? formatMoneyInput(contract.recurring_amount) : undefined}
            required
          />
        </label>
        <label>
          Dia de vencimento
          <input name="dueDay" type="number" min={1} max={31} defaultValue={contract?.due_day || 10} required />
        </label>
      </div>
      <div className="form-grid">
        <label>
          Periodicidade
          <select name="periodicity" defaultValue={contract?.periodicity || "mensal"}>
            <option value="mensal">Mensal</option>
            <option value="trimestral">Trimestral</option>
            <option value="semestral">Semestral</option>
            <option value="anual">Anual</option>
          </select>
        </label>
        <label>
          Inicio
          <input name="startsAt" type="date" defaultValue={contract?.starts_at || today} required />
        </label>
      </div>
      <label>
        Status
        <select name="status" defaultValue={contract?.status || "ativo"}>
          <option value="ativo">Ativo</option>
          <option value="rascunho">Rascunho</option>
          <option value="suspenso">Suspenso</option>
        </select>
      </label>
      <fieldset className="checkbox-panel">
        <legend>Servico na NFS-e</legend>
        <div className="form-grid">
          <label>
            Codigo nacional do servico
            <input
              name="serviceCode"
              inputMode="numeric"
              maxLength={6}
              placeholder="Ex.: 010701"
              defaultValue={fiscalString(fiscal, "serviceCode")}
              required
            />
          </label>
          <label>
            Codigo municipal do servico
            <input
              name="municipalServiceCode"
              placeholder="Ex.: 001"
              defaultValue={fiscalString(fiscal, "municipalServiceCode")}
            />
          </label>
          <label>
            Codigo NBS
            <input
              name="nbsCode"
              inputMode="numeric"
              pattern="[0-9]{9}"
              maxLength={9}
              placeholder="Ex.: 123456789"
              defaultValue={fiscalString(fiscal, "nbsCode")}
            />
          </label>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" name="retainIss" defaultChecked={fiscalBoolean(fiscal, "retainIss")} />
          <span>Reter ISSQN nesta operacao</span>
        </label>
      </fieldset>
      <label>
        Observacoes
        <textarea
          name="notes"
          placeholder="Regras comerciais, escopo e observacoes internas"
          defaultValue={contract?.notes || ""}
        />
      </label>
      <div className="page-form-actions">
        <a className="ghost-button button-link" href="/cadastros/contratos">Cancelar</a>
        <button className="primary-button" type="submit" disabled={!clients.length}>
          {contract ? "Salvar contrato" : "Criar contrato"}
        </button>
      </div>
    </form>
  );
}
