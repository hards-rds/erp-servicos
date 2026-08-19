"use client";

import { Download, RefreshCw, Send, X, XCircle } from "lucide-react";
import { useRef } from "react";

export function InterChargeActions({
  chargeId,
  externalId,
  status,
  integrationConfigured
}: {
  chargeId: string;
  externalId: string | null;
  status: string;
  integrationConfigured: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canCancel = Boolean(externalId && !["paga", "cancelada", "conciliada"].includes(status));

  return (
    <div className="table-actions">
      <form action="/api/billing/inter/charges" method="post">
        <input type="hidden" name="action" value={externalId ? "sync" : "process"} />
        <input type="hidden" name="chargeId" value={chargeId} />
        <button className="ghost-button compact-button button-with-icon" type="submit" disabled={!integrationConfigured}>
          {externalId ? <RefreshCw size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
          {externalId ? "Atualizar" : "Emitir"}
        </button>
      </form>
      {externalId ? (
        <a className="ghost-button compact-button button-link button-with-icon" href={`/api/billing/inter/charges/${chargeId}/pdf`}>
          <Download size={16} aria-hidden="true" />
          PDF
        </a>
      ) : null}
      {canCancel ? (
        <>
          <button className="ghost-button compact-button button-with-icon" type="button" onClick={() => dialogRef.current?.showModal()}>
            <XCircle size={16} aria-hidden="true" />
            Cancelar
          </button>
          <dialog className="action-dialog" ref={dialogRef} aria-labelledby={`cancel-inter-${chargeId}`}>
            <div className="dialog-header">
              <div>
                <h2 id={`cancel-inter-${chargeId}`}>Cancelar cobranca</h2>
                <p className="dialog-description">O cancelamento sera enviado ao Banco Inter.</p>
              </div>
              <button className="icon-button" type="button" title="Fechar" aria-label="Fechar" onClick={() => dialogRef.current?.close()}>
                <X aria-hidden="true" />
              </button>
            </div>
            <form className="form-stack" action="/api/billing/inter/charges" method="post">
              <input type="hidden" name="action" value="cancel" />
              <input type="hidden" name="chargeId" value={chargeId} />
              <label>Motivo<input name="reason" minLength={5} maxLength={50} required /></label>
              <div className="dialog-actions">
                <button className="ghost-button" type="button" onClick={() => dialogRef.current?.close()}>Voltar</button>
                <button className="danger-button" type="submit">Confirmar cancelamento</button>
              </div>
            </form>
          </dialog>
        </>
      ) : null}
    </div>
  );
}
