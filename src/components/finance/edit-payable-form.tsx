"use client";

type EditablePayable = {
  id: string;
  vendorName: string;
  category: string;
  description: string;
  competence: string;
  dueDate: string;
  amount: number | string;
  status: string;
  notes: string | null;
  scheduleLabel?: string | null;
};

export function EditPayableForm({ payable }: { payable: EditablePayable }) {
  return (
    <form className="form-stack" action="/api/financeiro/saidas" method="post">
      <input type="hidden" name="action" value="update" />
      <input type="hidden" name="payableId" value={payable.id} />
      {payable.scheduleLabel ? <p className="muted">{payable.scheduleLabel}. As alteracoes desta tela afetam somente esta competencia.</p> : null}
      <label>Fornecedor<input name="vendorName" defaultValue={payable.vendorName} required /></label>
      <div className="form-grid">
        <label>
          Categoria
          <input name="category" list="payable-edit-categories" defaultValue={payable.category} required />
          <datalist id="payable-edit-categories"><option value="Agua" /><option value="Aluguel" /><option value="Condominio" /><option value="Energia" /><option value="Estoque" /><option value="Fornecedores" /><option value="Impostos" /><option value="Internet" /><option value="Marketing" /><option value="Pessoal" /><option value="Servicos" /><option value="Software" /><option value="Telefonia" /><option value="Transporte" /></datalist>
        </label>
        <label>Valor<input name="amount" inputMode="decimal" defaultValue={Number(payable.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} required /></label>
      </div>
      <label>Descricao<input name="description" defaultValue={payable.description} required /></label>
      <div className="form-grid">
        <label>Competencia<input name="competence" type="month" defaultValue={payable.competence} required /></label>
        <label>Vencimento<input name="dueDate" type="date" defaultValue={payable.dueDate} required /></label>
      </div>
      <label>
        Situacao
        <select name="status" defaultValue={payable.status} required>
          <option value="previsto">Prevista</option>
          <option value="aprovado">Aprovada</option>
          <option value="vencido">Vencida</option>
          <option value="cancelado">Cancelada</option>
        </select>
      </label>
      <label>Observacao<textarea name="notes" rows={3} defaultValue={payable.notes || ""} /></label>
      <div className="page-form-actions">
        <a className="ghost-button button-link" href="/financeiro/saidas">Cancelar</a>
        <button className="primary-button" type="submit">Salvar alteracoes</button>
      </div>
    </form>
  );
}
