export type NfseStatus = "rascunho" | "validada" | "enfileirada" | "enviada" | "autorizada" | "rejeitada" | "cancelada" | "erro_integracao";

export type NfseDraft = {
  clientId: string;
  entryId: string;
  competence: string;
  serviceCode?: string;
  cityCode?: string;
  amountCents: number;
};

export function nfseIdempotencyKey(draft: Pick<NfseDraft, "clientId" | "entryId" | "competence">): string {
  return `nfse:${draft.clientId}:${draft.entryId}:${draft.competence}`;
}

export function validateNfseDraft(draft: NfseDraft): string[] {
  const errors: string[] = [];
  if (!draft.clientId) errors.push("Tomador/cliente obrigatorio.");
  if (!draft.entryId) errors.push("Entrada financeira obrigatoria.");
  if (!draft.competence) errors.push("Competencia obrigatoria.");
  if (!draft.serviceCode) errors.push("Codigo de servico obrigatorio.");
  if (!draft.cityCode) errors.push("Municipio de incidencia obrigatorio.");
  if (draft.amountCents <= 0) errors.push("Valor do servico deve ser maior que zero.");
  return errors;
}
