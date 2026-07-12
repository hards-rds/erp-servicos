export type ChargeStatus = "rascunho" | "solicitada" | "emitida" | "registrada" | "aguardando_pagamento" | "paga" | "vencida" | "cancelada" | "erro_integracao" | "conciliada";

export type ChargeDraft = {
  entryId: string;
  dueDate: string;
  amountCents: number;
  payerDocument: string;
};

export function interChargeIdempotencyKey(draft: Pick<ChargeDraft, "entryId" | "dueDate">): string {
  return `inter-charge:${draft.entryId}:${draft.dueDate}`;
}

export function validateChargeDraft(draft: ChargeDraft): string[] {
  const errors: string[] = [];
  if (!draft.entryId) errors.push("Entrada financeira obrigatoria.");
  if (!draft.dueDate) errors.push("Vencimento obrigatorio.");
  if (draft.amountCents <= 0) errors.push("Valor da cobranca deve ser maior que zero.");
  if (!draft.payerDocument) errors.push("Documento do pagador obrigatorio.");
  return errors;
}
