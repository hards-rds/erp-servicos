"use client";

import { Ban, X } from "lucide-react";
import { useRef } from "react";

type NfseCancelFormProps = {
  documentId: string;
  enabled: boolean;
};

export function NfseCancelForm({ documentId, enabled }: NfseCancelFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        className="danger-button compact-button button-with-icon"
        type="button"
        disabled={!enabled}
        title={enabled ? "Cancelar NFS-e" : "Cancelamento real indisponivel neste ambiente"}
        onClick={() => dialogRef.current?.showModal()}
      >
        <Ban aria-hidden="true" size={16} />
        Cancelar
      </button>
      <dialog className="action-dialog" ref={dialogRef} aria-labelledby={`cancel-title-${documentId}`}>
        <div className="dialog-header">
          <h2 id={`cancel-title-${documentId}`}>Cancelar NFS-e</h2>
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
        <form
          className="form-stack"
          action="/api/fiscal/nfse/cancelar"
          method="post"
          onSubmit={(event) => {
            if (!window.confirm("Confirmar o cancelamento fiscal definitivo desta NFS-e?")) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="nfseDocumentId" value={documentId} />
          <input type="hidden" name="productionConfirmed" value="true" />
          <label>
            Motivo
            <select name="reasonCode" defaultValue="1" required>
              <option value="1">Erro na emissao</option>
              <option value="2">Servico nao prestado</option>
              <option value="9">Outros</option>
            </select>
          </label>
          <label>
            Justificativa
            <textarea
              name="reason"
              minLength={15}
              maxLength={255}
              placeholder="Descreva o erro que exige o cancelamento"
              required
            />
          </label>
          <div className="dialog-actions">
            <button className="ghost-button" type="button" onClick={() => dialogRef.current?.close()}>
              Voltar
            </button>
            <button className="danger-button" type="submit">
              Confirmar cancelamento
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
