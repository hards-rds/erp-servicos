"use client";

import { Banknote, X } from "lucide-react";
import { useRef } from "react";

type ReceiveEntryFormProps = {
  entryId: string;
  description: string;
  amount: number | string;
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ReceiveEntryForm({ entryId, description, amount }: ReceiveEntryFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <button
        className="ghost-button compact-button button-with-icon"
        type="button"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Banknote aria-hidden="true" size={16} />
        Dar baixa
      </button>
      <dialog className="action-dialog" ref={dialogRef} aria-labelledby={`receive-title-${entryId}`}>
        <div className="dialog-header">
          <div>
            <h2 id={`receive-title-${entryId}`}>Registrar recebimento</h2>
            <p className="dialog-description">{description} · {formatMoney(amount)}</p>
          </div>
          <button
            className="icon-button"
            type="button"
            title="Fechar"
            aria-label="Fechar"
            onClick={() => dialogRef.current?.close()}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <form className="form-stack" action="/api/financeiro/entradas" method="post">
          <input type="hidden" name="action" value="receive" />
          <input type="hidden" name="entryId" value={entryId} />
          <div className="form-grid">
            <label>
              Data do recebimento
              <input name="receivedAt" type="date" defaultValue={today} required />
            </label>
            <label>
              Valor recebido
              <input
                name="receivedAmount"
                inputMode="decimal"
                defaultValue={Number(amount).toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })}
                required
              />
            </label>
          </div>
          <label>
            Forma de pagamento
            <select name="paymentMethod" defaultValue="pix" required>
              <option value="pix">Pix</option>
              <option value="cartao_credito">Cartao de credito</option>
              <option value="cartao_debito">Cartao de debito</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="boleto">Boleto</option>
              <option value="transferencia">Transferencia</option>
              <option value="outro">Outro</option>
            </select>
          </label>
          <label>
            Observacao
            <input name="paymentNotes" placeholder="Autorizacao, parcela ou observacao" />
          </label>
          <div className="dialog-actions">
            <button className="ghost-button" type="button" onClick={() => dialogRef.current?.close()}>
              Voltar
            </button>
            <button className="primary-button" type="submit">Confirmar baixa</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
