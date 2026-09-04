"use client";

import { Banknote, Trash2, X } from "lucide-react";
import { useRef } from "react";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";

type ReceiveEntryFormProps = {
  entryId: string;
  description: string;
  amount: number | string;
  competence: string;
  canReceive: boolean;
  canDelete: boolean;
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function EntryActions({ entryId, description, amount, competence, canReceive, canDelete }: ReceiveEntryFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <RowActionsMenu label={`Acoes da entrada ${description}`}>
      {canReceive ? (
        <button
          className="ghost-button compact-button button-with-icon"
          type="button"
          onClick={() => dialogRef.current?.showModal()}
        >
          <Banknote aria-hidden="true" size={16} />
          Dar baixa
        </button>
      ) : null}
      <form
        action={`/api/financeiro/entradas?competence=${competence}`}
        method="post"
        onSubmit={(event) => {
          const confirmed = window.confirm(
            `Excluir permanentemente a entrada "${description}" no valor de ${formatMoney(amount)}? Esta acao nao pode ser desfeita.`
          );
          if (!confirmed) event.preventDefault();
        }}
      >
        <input type="hidden" name="action" value="delete" />
        <input type="hidden" name="entryId" value={entryId} />
        <button
          className="danger-button compact-button button-with-icon"
          type="submit"
          disabled={!canDelete}
          title={canDelete ? "Excluir entrada" : "Entradas recebidas ou conciliadas devem permanecer no historico"}
        >
          <Trash2 aria-hidden="true" size={16} />
          Excluir
        </button>
      </form>
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
        <form className="form-stack" action={`/api/financeiro/entradas?competence=${competence}`} method="post">
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
    </RowActionsMenu>
  );
}
