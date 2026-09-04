"use client";

import { Banknote, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EntryActions } from "@/components/finance/receive-entry-form";
import { StatusBadge } from "@/components/ui/status-badge";

export type FinancialEntryTableRow = {
  id: string;
  description: string;
  clientName: string;
  competence: string;
  dueDate: string;
  receivedAt: string | null;
  receivedAmount: number | string | null;
  netAmount: number | string;
  paymentMethod: string | null;
  status: string;
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function getTone(status: string) {
  if (["recebido", "conciliado"].includes(status)) return "success" as const;
  if (["aguardando_pagamento", "vencido", "emitido"].includes(status)) return "warning" as const;
  return "neutral" as const;
}

function canReceive(entry: FinancialEntryTableRow) {
  return !["recebido", "conciliado", "cancelado"].includes(entry.status);
}

export function EntriesBatchTable({ entries, competence }: { entries: FinancialEntryTableRow[]; competence: string }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  const eligibleEntries = useMemo(() => entries.filter(canReceive), [entries]);
  const selectedEntries = useMemo(
    () => eligibleEntries.filter((entry) => selectedIds.includes(entry.id)),
    [eligibleEntries, selectedIds]
  );
  const allSelected = eligibleEntries.length > 0 && selectedEntries.length === eligibleEntries.length;
  const selectedTotal = selectedEntries.reduce((total, entry) => total + Number(entry.netAmount), 0);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedEntries.length > 0 && !allSelected;
    }
  }, [allSelected, selectedEntries.length]);

  function toggleEntry(entryId: string, checked: boolean) {
    setSelectedIds((current) => checked
      ? [...new Set([...current, entryId])]
      : current.filter((id) => id !== entryId));
  }

  return (
    <section className="table-panel">
      <div className="table-panel-heading">
        <div>
          <h2>Lancamentos</h2>
          <p>Selecione as entradas que deseja marcar como recebidas.</p>
        </div>
        <div className="batch-toolbar">
          <span>{selectedEntries.length} selecionada(s)</span>
          <button
            className="primary-button compact-button button-with-icon"
            type="button"
            disabled={!selectedEntries.length}
            onClick={() => dialogRef.current?.showModal()}
          >
            <Banknote aria-hidden="true" size={16} />
            Dar baixa selecionadas
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
                  aria-label="Selecionar todas as entradas em aberto"
                  checked={allSelected}
                  disabled={!eligibleEntries.length}
                  onChange={(event) => setSelectedIds(
                    event.target.checked ? eligibleEntries.map((entry) => entry.id) : []
                  )}
                />
              </th>
              <th>Descricao</th>
              <th>Cliente</th>
              <th>Competencia</th>
              <th>Vencimento</th>
              <th>Valor liquido</th>
              <th>Recebimento</th>
              <th>Status</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {entries.length ? entries.map((entry) => {
              const receivable = canReceive(entry);
              return (
                <tr key={entry.id}>
                  <td className="selection-cell">
                    <input
                      className="table-checkbox"
                      type="checkbox"
                      aria-label={`Selecionar entrada de ${entry.clientName}`}
                      checked={selectedIds.includes(entry.id)}
                      disabled={!receivable}
                      onChange={(event) => toggleEntry(entry.id, event.target.checked)}
                    />
                  </td>
                  <td>{entry.description}</td>
                  <td>{entry.clientName}</td>
                  <td>{entry.competence}</td>
                  <td>{formatDate(entry.dueDate)}</td>
                  <td>{formatMoney(entry.netAmount)}</td>
                  <td>
                    {entry.receivedAt ? (
                      <>
                        <strong>{formatMoney(entry.receivedAmount || entry.netAmount)}</strong>
                        <div className="muted">{formatDate(entry.receivedAt)} · {entry.paymentMethod || "-"}</div>
                      </>
                    ) : "-"}
                  </td>
                  <td><StatusBadge tone={getTone(entry.status)}>{entry.status}</StatusBadge></td>
                  <td>
                    <EntryActions
                      entryId={entry.id}
                      description={entry.description}
                      amount={entry.netAmount}
                      competence={competence}
                      canReceive={receivable}
                      canDelete={!entry.receivedAt && !["recebido", "conciliado"].includes(entry.status)}
                    />
                  </td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={9}>Nenhuma entrada financeira cadastrada.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <dialog className="action-dialog" ref={dialogRef} aria-labelledby="receive-batch-title">
        <div className="dialog-header">
          <div>
            <h2 id="receive-batch-title">Registrar recebimentos</h2>
            <p className="dialog-description">
              {selectedEntries.length} lancamento(s) · total de {formatMoney(selectedTotal)}
            </p>
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
        <p>Os lancamentos serao baixados integralmente com os dados abaixo.</p>
        <form className="form-stack" action={`/api/financeiro/entradas?competence=${competence}`} method="post">
          <input type="hidden" name="action" value="receive_batch" />
          <input type="hidden" name="competence" value={competence} />
          {selectedEntries.map((entry) => (
            <input key={entry.id} type="hidden" name="entryIds" value={entry.id} />
          ))}
          <div className="form-grid">
            <label>
              Data do recebimento
              <input name="receivedAt" type="date" defaultValue={today} required />
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
            Observacao
            <input name="paymentNotes" placeholder="Comprovante, autorizacao ou observacao do lote" />
          </label>
          <div className="dialog-actions">
            <button className="ghost-button" type="button" onClick={() => dialogRef.current?.close()}>
              Voltar
            </button>
            <button className="primary-button" type="submit">Confirmar baixas</button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
