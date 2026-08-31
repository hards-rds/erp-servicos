"use client";

import { useEffect, useRef, useState } from "react";
import { NfseDeleteTestForm } from "@/components/fiscal/nfse-delete-test-form";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { StatusBadge } from "@/components/ui/status-badge";

export type NfseBatchQueueDocument = {
  id: string;
  description: string;
  clientName: string;
  competence: string;
  value: string;
  status: string;
  rejectionMessage: string | null;
  contractId: string | null;
};

function statusTone(status: string) {
  if (status === "autorizada") return "success" as const;
  if (["enfileirada", "validada", "enviada", "rejeitada", "erro_integracao"].includes(status)) return "warning" as const;
  return "neutral" as const;
}

export function NfseBatchQueue({
  documents,
  canEdit,
  canEmit,
  realProduction
}: {
  documents: NfseBatchQueueDocument[];
  canEdit: boolean;
  canEmit: boolean;
  realProduction: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const allSelected = documents.length > 0 && selectedIds.length === documents.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedIds.length > 0 && !allSelected;
    }
  }, [allSelected, selectedIds.length]);

  function toggleDocument(documentId: string, checked: boolean) {
    setSelectedIds((current) => checked
      ? [...new Set([...current, documentId])]
      : current.filter((id) => id !== documentId));
  }

  async function emitSelected() {
    if (!selectedIds.length || processing || !canEmit) return;
    const confirmation = realProduction
      ? `Confirmar a emissao real de ${selectedIds.length} NFS-e(s) em producao?`
      : `Validar ${selectedIds.length} NFS-e(s) selecionada(s)?`;
    if (!window.confirm(confirmation)) return;

    setProcessing(true);
    setProgress(0);
    let failed = 0;

    for (let index = 0; index < selectedIds.length; index += 1) {
      const formData = new FormData();
      formData.set("nfseDocumentId", selectedIds[index]);
      if (realProduction) formData.set("productionConfirmed", "true");

      try {
        const response = await fetch("/api/fiscal/nfse/emitir", {
          method: "POST",
          body: formData,
          redirect: "manual"
        });
        if (response.status >= 400) failed += 1;
      } catch {
        failed += 1;
      }
      setProgress(index + 1);
    }

    const succeeded = selectedIds.length - failed;
    const message = failed
      ? `Lote concluido: ${succeeded} processada(s) e ${failed} com falha de comunicacao.`
      : `Lote enviado: ${succeeded} nota(s) processada(s). Confira os status individuais.`;
    window.location.assign(`/fiscal/emissao-nfse?status=batch_submitted&message=${encodeURIComponent(message)}`);
  }

  return (
    <section className="table-panel">
      <div className="table-panel-heading">
        <div>
          <h2>Fila fiscal</h2>
          <p>Selecione uma ou mais notas para validar e emitir em sequencia.</p>
        </div>
        <div className="batch-toolbar">
          <span>{selectedIds.length} selecionada(s)</span>
          <button className="primary-button compact-button" type="button" disabled={!selectedIds.length || processing || !canEmit} onClick={emitSelected}>
            {processing ? `Processando ${progress}/${selectedIds.length}` : realProduction ? "Emitir selecionadas" : "Validar selecionadas"}
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="selection-cell">
                <input
                  ref={selectAllRef}
                  className="table-checkbox"
                  type="checkbox"
                  aria-label="Selecionar todas as notas da fila"
                  checked={allSelected}
                  disabled={!documents.length || processing || !canEmit}
                  onChange={(event) => setSelectedIds(event.target.checked ? documents.map((document) => document.id) : [])}
                />
              </th>
              <th>Entrada</th>
              <th>Tomador</th>
              <th>Competencia</th>
              <th>Valor</th>
              <th>Status fiscal</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {documents.length ? documents.map((document) => (
              <tr key={document.id}>
                <td className="selection-cell">
                  <input
                    className="table-checkbox"
                    type="checkbox"
                    aria-label={`Selecionar NFS-e de ${document.clientName}`}
                    checked={selectedIds.includes(document.id)}
                    disabled={processing || !canEmit}
                    onChange={(event) => toggleDocument(document.id, event.target.checked)}
                  />
                </td>
                <td>{document.description}</td>
                <td>{document.clientName}</td>
                <td>{document.competence}</td>
                <td>{document.value}</td>
                <td>
                  <StatusBadge tone={statusTone(document.status)}>{document.status}</StatusBadge>
                  {document.rejectionMessage ? <div className="table-error-detail">{document.rejectionMessage}</div> : null}
                </td>
                <td>
                  <RowActionsMenu label={`Acoes da NFS-e de ${document.clientName}`}>
                    <a className="primary-button button-link compact-button" href={`/fiscal/emissao-nfse?documentId=${document.id}`}>Conferir</a>
                    {document.status === "rejeitada" && document.contractId ? (
                      <a className="ghost-button button-link compact-button" href={`/cadastros/contratos/${document.contractId}/editar`}>Corrigir contrato</a>
                    ) : null}
                    {canEdit ? <NfseDeleteTestForm documentId={document.id} /> : null}
                  </RowActionsMenu>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={7}>Nenhuma nota em fila de emissao.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
