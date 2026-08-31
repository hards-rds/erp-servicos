type ContractorFormValues = {
  id?: string;
  legalName?: string;
  tradeName?: string;
  taxId?: string;
  roleTitle?: string;
  email?: string;
  phone?: string;
  pixKey?: string;
  fixedMonthlyAmount?: number | string;
  costAllowanceAmount?: number | string;
  commissionRate?: number | string;
  commissionBasis?: "contracted" | "received";
  dueDay?: number;
  startsAt?: string;
  endsAt?: string;
  active?: boolean;
  notes?: string;
};

function decimalValue(value: number | string | undefined) {
  if (value === undefined || value === "") return "0,00";
  return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function ContractorForm({
  action,
  submitLabel,
  initialValues = {}
}: {
  action: "create" | "update";
  submitLabel: string;
  initialValues?: ContractorFormValues;
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form className="form-stack" action="/api/pessoas/colaboradores" method="post">
      <input type="hidden" name="action" value={action} />
      {initialValues.id ? <input type="hidden" name="contractorId" value={initialValues.id} /> : null}

      <div className="form-grid">
        <label>
          CNPJ
          <input name="taxId" defaultValue={initialValues.taxId || ""} placeholder="00.000.000/0000-00" required />
        </label>
        <label>
          Razao social
          <input name="legalName" defaultValue={initialValues.legalName || ""} required />
        </label>
        <label>
          Nome fantasia
          <input name="tradeName" defaultValue={initialValues.tradeName || ""} />
        </label>
        <label>
          Funcao ou servico prestado
          <input name="roleTitle" defaultValue={initialValues.roleTitle || ""} placeholder="Ex.: Suporte tecnico" required />
        </label>
        <label>
          E-mail
          <input name="email" type="email" defaultValue={initialValues.email || ""} />
        </label>
        <label>
          Telefone
          <input name="phone" defaultValue={initialValues.phone || ""} />
        </label>
        <label>
          Chave Pix
          <input name="pixKey" defaultValue={initialValues.pixKey || ""} />
        </label>
        <label>
          Dia de pagamento
          <input name="dueDay" type="number" min="1" max="31" defaultValue={initialValues.dueDay || 10} required />
        </label>
      </div>

      <fieldset>
        <legend>Composicao mensal</legend>
        <div className="form-grid">
          <label>
            Valor fixo mensal
            <input name="fixedMonthlyAmount" inputMode="decimal" defaultValue={decimalValue(initialValues.fixedMonthlyAmount)} required />
          </label>
          <label>
            Ajuda de custo mensal
            <input name="costAllowanceAmount" inputMode="decimal" defaultValue={decimalValue(initialValues.costAllowanceAmount)} required />
          </label>
          <label>
            Comissao sobre contratos (%)
            <input name="commissionRate" inputMode="decimal" defaultValue={decimalValue(initialValues.commissionRate)} required />
          </label>
          <label>
            Base da comissao
            <select name="commissionBasis" defaultValue={initialValues.commissionBasis || "contracted"} required>
              <option value="contracted">Contratos previstos no mes</option>
              <option value="received">Contratos recebidos no mes</option>
            </select>
          </label>
        </div>
      </fieldset>

      <div className="form-grid">
        <label>
          Inicio da prestacao
          <input name="startsAt" type="date" defaultValue={initialValues.startsAt || today} required />
        </label>
        <label>
          Encerramento
          <input name="endsAt" type="date" defaultValue={initialValues.endsAt || ""} />
        </label>
      </div>
      <label className="checkbox-row">
        <input name="active" type="checkbox" defaultChecked={initialValues.active ?? true} />
        Prestador ativo
      </label>
      <label>
        Observacoes
        <textarea name="notes" rows={4} defaultValue={initialValues.notes || ""} />
      </label>
      <div className="page-form-actions">
        <Link className="ghost-button button-link" href="/pessoas/colaboradores">Cancelar</Link>
        <button className="primary-button" type="submit">{submitLabel}</button>
      </div>
    </form>
  );
}
import Link from "next/link";
