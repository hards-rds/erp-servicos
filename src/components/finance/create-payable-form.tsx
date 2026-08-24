"use client";

import { useState } from "react";

export function CreatePayableForm() {
  const [status, setStatus] = useState("previsto");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form className="form-stack" action="/api/financeiro/saidas" method="post">
      <label>Fornecedor<input name="vendorName" placeholder="Nome do fornecedor" required /></label>
      <div className="form-grid">
        <label>
          Categoria
          <input name="category" list="payable-categories" placeholder="Ex.: Estoque" required />
          <datalist id="payable-categories"><option value="Aluguel" /><option value="Estoque" /><option value="Fornecedores" /><option value="Impostos" /><option value="Marketing" /><option value="Pessoal" /><option value="Servicos" /><option value="Software" /><option value="Transporte" /></datalist>
        </label>
        <label>Valor<input name="amount" inputMode="decimal" placeholder="0,00" required /></label>
      </div>
      <label>Descricao<input name="description" placeholder="Identifique esta despesa" required /></label>
      <div className="form-grid">
        <label>Competencia<input name="competence" type="month" defaultValue={today.slice(0, 7)} required /></label>
        <label>Vencimento<input name="dueDate" type="date" defaultValue={today} required /></label>
      </div>
      <label>Situacao<select name="status" value={status} onChange={(event) => setStatus(event.target.value)} required><option value="previsto">Prevista</option><option value="aprovado">Aprovada</option><option value="pago">Paga</option></select></label>
      {status === "pago" ? (
        <div className="form-grid">
          <label>Data do pagamento<input name="paidAt" type="date" defaultValue={today} required /></label>
          <label>Forma de pagamento<select name="paymentMethod" defaultValue="pix" required><option value="pix">Pix</option><option value="cartao_credito">Cartao de credito</option><option value="cartao_debito">Cartao de debito</option><option value="dinheiro">Dinheiro</option><option value="boleto">Boleto</option><option value="transferencia">Transferencia</option><option value="outro">Outro</option></select></label>
        </div>
      ) : null}
      <label>Observacao<textarea name="notes" rows={3} placeholder="Documento, parcela ou informacao complementar" /></label>
      <div className="page-form-actions"><a className="ghost-button button-link" href="/financeiro/saidas">Cancelar</a><button className="primary-button" type="submit">Cadastrar saida</button></div>
    </form>
  );
}
