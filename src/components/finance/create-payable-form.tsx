"use client";

import { useState } from "react";
import type { PayableScheduleType } from "@/domains/finance/payable-schedules";

export function CreatePayableForm() {
  const [status, setStatus] = useState("previsto");
  const [scheduleType, setScheduleType] = useState<PayableScheduleType>("single");
  const today = new Date().toISOString().slice(0, 10);

  function changeScheduleType(nextType: PayableScheduleType) {
    setScheduleType(nextType);
    if (nextType !== "single" && status === "pago") setStatus("previsto");
  }

  return (
    <form className="form-stack" action="/api/financeiro/saidas" method="post">
      <input type="hidden" name="action" value="create" />
      <input type="hidden" name="scheduleType" value={scheduleType} />
      <fieldset className="checkbox-panel">
        <legend>Tipo de saida</legend>
        <div className="segmented-control" role="group" aria-label="Tipo de saida">
          <button type="button" aria-pressed={scheduleType === "single"} onClick={() => changeScheduleType("single")}>Avulsa</button>
          <button type="button" aria-pressed={scheduleType === "installment"} onClick={() => changeScheduleType("installment")}>Parcelada</button>
          <button type="button" aria-pressed={scheduleType === "fixed"} onClick={() => changeScheduleType("fixed")}>Fixa mensal</button>
        </div>
      </fieldset>
      <label>Fornecedor<input name="vendorName" placeholder="Nome do fornecedor" required /></label>
      <div className="form-grid">
        <label>
          Categoria
          <input name="category" list="payable-categories" placeholder="Ex.: Estoque" required />
          <datalist id="payable-categories"><option value="Agua" /><option value="Aluguel" /><option value="Condominio" /><option value="Energia" /><option value="Estoque" /><option value="Fornecedores" /><option value="Impostos" /><option value="Internet" /><option value="Marketing" /><option value="Pessoal" /><option value="Servicos" /><option value="Software" /><option value="Telefonia" /><option value="Transporte" /></datalist>
        </label>
        <label>
          {scheduleType === "installment" ? "Valor total da compra" : scheduleType === "fixed" ? "Valor mensal" : "Valor"}
          <input name="amount" inputMode="decimal" placeholder="0,00" required />
        </label>
      </div>
      {scheduleType === "installment" ? (
        <label>Quantidade de parcelas<input name="installmentCount" type="number" min={2} max={120} defaultValue={10} required /></label>
      ) : null}
      <label>Descricao<input name="description" placeholder="Identifique esta despesa" required /></label>
      <div className="form-grid">
        <label>{scheduleType === "single" ? "Competencia" : "Primeira competencia"}<input name="competence" type="month" defaultValue={today.slice(0, 7)} required /></label>
        <label>{scheduleType === "single" ? "Vencimento" : "Primeiro vencimento"}<input name="dueDate" type="date" defaultValue={today} required /></label>
      </div>
      <label>Situacao<select name="status" value={status} onChange={(event) => setStatus(event.target.value)} required><option value="previsto">Prevista</option><option value="aprovado">Aprovada</option>{scheduleType === "single" ? <option value="pago">Paga</option> : null}</select></label>
      {status === "pago" ? (
        <div className="form-grid">
          <label>Data do pagamento<input name="paidAt" type="date" defaultValue={today} required /></label>
          <label>Forma de pagamento<select name="paymentMethod" defaultValue="pix" required><option value="pix">Pix</option><option value="cartao_credito">Cartao de credito</option><option value="cartao_debito">Cartao de debito</option><option value="dinheiro">Dinheiro</option><option value="boleto">Boleto</option><option value="transferencia">Transferencia</option><option value="outro">Outro</option></select></label>
        </div>
      ) : null}
      <label>Observacao<textarea name="notes" rows={3} placeholder="Documento, parcela ou informacao complementar" /></label>
      <div className="page-form-actions"><a className="ghost-button button-link" href="/financeiro/saidas">Cancelar</a><button className="primary-button" type="submit">{scheduleType === "installment" ? "Gerar parcelas" : scheduleType === "fixed" ? "Cadastrar despesa fixa" : "Cadastrar saida"}</button></div>
    </form>
  );
}
