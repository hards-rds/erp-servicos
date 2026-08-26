"use client";

import { Banknote, Pencil, X } from "lucide-react";
import { useRef } from "react";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";

type PayableActionsProps = {
  payableId: string;
  description: string;
  amount: number | string;
  canEdit: boolean;
  canPay: boolean;
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function PayableActions({ payableId, description, amount, canEdit, canPay }: PayableActionsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  if (!canEdit && !canPay) return <span className="muted">-</span>;

  return (
    <RowActionsMenu label={`Acoes da saida ${description}`}>
      {canEdit ? (
        <a
          className="ghost-button button-link compact-button button-with-icon"
          href={`/financeiro/saidas/${payableId}/editar`}
        >
          <Pencil aria-hidden="true" size={16} />
          Editar
        </a>
      ) : null}
      {canPay ? (
        <button
          className="primary-button compact-button button-with-icon"
          type="button"
          onClick={() => dialogRef.current?.showModal()}
        >
          <Banknote aria-hidden="true" size={16} />
          Dar baixa
        </button>
      ) : null}
      <dialog className="action-dialog" ref={dialogRef} aria-labelledby={`pay-payable-${payableId}`}>
        <div className="dialog-header">
          <div>
            <h2 id={`pay-payable-${payableId}`}>Confirmar pagamento</h2>
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
        <form className="form-stack" action="/api/financeiro/saidas" method="post">
          <input type="hidden" name="action" value="pay" />
          <input type="hidden" name="payableId" value={payableId} />
          <div className="form-grid">
            <label>
              Data do pagamento
              <input name="paidAt" type="date" defaultValue={today} required />
            </label>
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
          </div>
          <label>
            Observacao do pagamento
            <input name="paymentNotes" placeholder="Comprovante, autorizacao ou observacao" />
          </label>
          <div className="dialog-actions">
            <button className="ghost-button" type="button" onClick={() => dialogRef.current?.close()}>Voltar</button>
            <button className="primary-button" type="submit">Confirmar baixa</button>
          </div>
        </form>
      </dialog>
    </RowActionsMenu>
  );
}
