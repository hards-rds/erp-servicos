"use client";

import JSZip from "jszip";
import { Download } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NfseCancelForm } from "@/components/fiscal/nfse-cancel-form";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { buildDanfseDownloadFileName } from "@/lib/files/download-name";

export type IssuedNfseDocument = {
  id: string;
  number: string;
  clientName: string;
  competence: string;
  value: string;
  status: string;
  hasPdf: boolean;
};

function getTone(status: string) {
  return status === "autorizada" ? "success" as const : "neutral" as const;
}

function uniqueFileName(document: IssuedNfseDocument, usedNames: Set<string>) {
  const preferred = buildDanfseDownloadFileName(document.clientName, document.number);
  if (!usedNames.has(preferred)) {
    usedNames.add(preferred);
    return preferred;
  }

  const fallback = preferred.replace(/\.pdf$/i, `-${document.id.slice(0, 8)}.pdf`);
  usedNames.add(fallback);
  return fallback;
}

export function IssuedNfseTable({
  documents,
  competence,
  canCancel,
  cancellationEnabled
}: {
  documents: IssuedNfseDocument[];
  competence: string;
  canCancel: boolean;
  cancellationEnabled: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const selectedDocuments = useMemo(
    () => documents.filter((document) => selectedIds.includes(document.id)),
    [documents, selectedIds]
  );
  const allSelected = documents.length > 0 && selectedDocuments.length === documents.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedDocuments.length > 0 && !allSelected;
    }
  }, [allSelected, selectedDocuments.length]);

  function toggleDocument(documentId: string, checked: boolean) {
    setSelectedIds((current) => checked
      ? [...new Set([...current, documentId])]
      : current.filter((id) => id !== documentId));
  }

  async function downloadSelected() {
    if (!selectedDocuments.length || processing) return;

    setProcessing(true);
    setProgress(0);
    const zip = new JSZip();
    const failures: string[] = [];
    const usedNames = new Set<string>();
    let nextIndex = 0;
    let completed = 0;

    async function worker() {
      while (nextIndex < selectedDocuments.length) {
        const document = selectedDocuments[nextIndex];
        nextIndex += 1;

        try {
          const response = await fetch(`/api/fiscal/nfse/danfse?id=${encodeURIComponent(document.id)}`);
          const contentType = response.headers.get("content-type") || "";
          if (!response.ok || !contentType.includes("application/pdf")) {
            throw new Error("PDF indisponivel");
          }
          zip.file(uniqueFileName(document, usedNames), await response.arrayBuffer());
        } catch {
          failures.push(`${document.number} - ${document.clientName}`);
        } finally {
          completed += 1;
          setProgress(completed);
        }
      }
    }

    try {
      const workerCount = Math.min(4, selectedDocuments.length);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));
      const succeeded = selectedDocuments.length - failures.length;
      if (!succeeded) {
        window.alert("Nao foi possivel baixar os PDFs selecionados.");
        return;
      }

      if (failures.length) {
        zip.file(
          "notas-nao-baixadas.txt",
          `Os PDFs abaixo nao puderam ser incluidos:\n\n${failures.join("\n")}`
        );
      }

      const content = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const url = URL.createObjectURL(content);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `notas-fiscais-${competence}.zip`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      if (failures.length) {
        window.alert(`ZIP gerado com ${succeeded} PDF(s). ${failures.length} nota(s) nao puderam ser baixadas.`);
      }
    } finally {
      setProcessing(false);
    }
  }

  return (
    <section className="table-panel">
      <div className="table-panel-heading">
        <div>
          <h2>Documentos fiscais</h2>
          <p>Selecione uma ou mais notas para baixar os PDFs em um unico arquivo ZIP.</p>
        </div>
        <div className="batch-toolbar">
          <span>{selectedDocuments.length} selecionada(s)</span>
          <button
            className="primary-button compact-button button-with-icon"
            type="button"
            disabled={!selectedDocuments.length || processing}
            onClick={downloadSelected}
          >
            <Download aria-hidden="true" size={16} />
            {processing ? `Baixando ${progress}/${selectedDocuments.length}` : "Baixar selecionadas"}
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
                  aria-label="Selecionar todas as notas emitidas"
                  checked={allSelected}
                  disabled={!documents.length || processing}
                  onChange={(event) => setSelectedIds(
                    event.target.checked ? documents.map((document) => document.id) : []
                  )}
                />
              </th>
              <th>Numero</th>
              <th>Cliente</th>
              <th>Competencia</th>
              <th>Valor</th>
              <th>Status</th>
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
                    aria-label={`Selecionar NFS-e ${document.number} de ${document.clientName}`}
                    checked={selectedIds.includes(document.id)}
                    disabled={processing}
                    onChange={(event) => toggleDocument(document.id, event.target.checked)}
                  />
                </td>
                <td>{document.number}</td>
                <td>{document.clientName}</td>
                <td>{document.competence}</td>
                <td>{document.value}</td>
                <td><StatusBadge tone={getTone(document.status)}>{document.status}</StatusBadge></td>
                <td>
                  <RowActionsMenu label={`Acoes da NFS-e de ${document.clientName}`}>
                    <a className="ghost-button compact-button button-link" href={`/api/fiscal/nfse/xml?id=${document.id}`}>
                      Baixar XML
                    </a>
                    {document.hasPdf ? (
                      <>
                        <a className="ghost-button compact-button button-link" href={`/api/fiscal/nfse/danfse?id=${document.id}`}>
                          Baixar PDF
                        </a>
                        <form action="/api/fiscal/nfse/danfse" method="post">
                          <input type="hidden" name="nfseDocumentId" value={document.id} />
                          <button className="ghost-button compact-button" type="submit">Atualizar PDF</button>
                        </form>
                      </>
                    ) : (
                      <form action="/api/fiscal/nfse/danfse" method="post">
                        <input type="hidden" name="nfseDocumentId" value={document.id} />
                        <button className="ghost-button compact-button" type="submit">Gerar PDF</button>
                      </form>
                    )}
                    <form action="/api/fiscal/nfse/enviar-email" method="post">
                      <input type="hidden" name="nfseDocumentId" value={document.id} />
                      <button className="ghost-button compact-button" type="submit">Enviar email</button>
                    </form>
                    {document.status === "autorizada" && canCancel ? (
                      <NfseCancelForm documentId={document.id} enabled={cancellationEnabled} />
                    ) : null}
                  </RowActionsMenu>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={7}>Nenhuma nota emitida.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
