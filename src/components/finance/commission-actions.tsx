"use client";

import { Banknote, Check, X, XCircle } from "lucide-react";
import { useRef } from "react";

type CommissionActionsProps = {
  commissionId: string;
  description: string;
  amount: number | string;
  status: string;
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CommissionActions({ commissionId, description, amount, status }: CommissionActionsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  if (!["pendente", "aprovada"].includes(status)) return <span className="muted">-</span>;

  return (
    <div className="table-actions">
      {status === "pendente" ? (
        <form action="/api/financeiro/comissoes" method="post">
          <input type="hidden" name="action" value="approve" />
          <input type="hidden" name="commissionId" value={commissionId} />
          <button className="ghost-button compact-button button-with-icon" type="submit">
            <Check aria-hidden="true" size={16} />
            Aprovar
          </button>
        </form>
      ) : (
        <>
          <button
            className="ghost-button compact-button button-with-icon"
            type="button"
            onClick={() => dialogRef.current?.showModal()}
          >
            <Banknote aria-hidden="true" size={16} />
            Pagar
          </button>
          <dialog className="action-dialog" ref={dialogRef} aria-labelledby={`pay-commission-${commissionId}`}>
            <div className="dialog-header">
              <div>
                <h2 id={`pay-commission-${commissionId}`}>Pagar comissao</h2>
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
            <form className="form-stack" action="/api/financeiro/comissoes" method="post">
              <input type="hidden" name="action" value="pay" />
              <input type="hidden" name="commissionId" value={commissionId} />
              <div className="form-grid">
                <label>
                  Data do pagamento
                  <input name="paidAt" type="date" defaultValue={today} required />
                </label>
                <label>
                  Forma de pagamento
                  <select name="paymentMethod" defaultValue="pix" required>
                    <option value="pix">Pix</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="dinheiro">Dinheiro</option>
                    <option value="outro">Outro</option>
                  </select>
                </label>
              </div>
              <label>
                Observacao
                <input name="paymentNotes" placeholder="Comprovante ou observacao" />
              </label>
              <div className="dialog-actions">
                <button className="ghost-button" type="button" onClick={() => dialogRef.current?.close()}>Voltar</button>
                <button className="primary-button" type="submit">Confirmar pagamento</button>
              </div>
            </form>
          </dialog>
        </>
      )}
      <form
        action="/api/financeiro/comissoes"
        method="post"
        onSubmit={(event) => {
          if (!window.confirm("Cancelar esta comissao?")) event.preventDefault();
        }}
      >
        <input type="hidden" name="action" value="cancel" />
        <input type="hidden" name="commissionId" value={commissionId} />
        <button className="icon-button" type="submit" title="Cancelar comissao" aria-label="Cancelar comissao">
          <XCircle aria-hidden="true" size={17} />
        </button>
      </form>
    </div>
  );
}
