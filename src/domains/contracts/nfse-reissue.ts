export type ReopenContractEntryInput = {
  status: string;
  receivedAt: string | null;
  documentStatuses: string[];
};

export function canReopenContractEntryAfterNfseCancellation(input: ReopenContractEntryInput) {
  return input.status === "cancelado"
    && !input.receivedAt
    && input.documentStatuses.length > 0
    && input.documentStatuses.every((status) => status === "cancelada");
}

export function contractNfseIdempotencyKey(contractId: string, competence: string, replacedDocumentId?: string | null) {
  const base = `nfse:contract:${contractId}:competence:${competence}`;
  return replacedDocumentId ? `${base}:reemissao:${replacedDocumentId}` : base;
}
