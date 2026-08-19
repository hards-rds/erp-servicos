export type ChargeStatus = "rascunho" | "solicitada" | "emitida" | "registrada" | "aguardando_pagamento" | "paga" | "vencida" | "cancelada" | "erro_integracao" | "conciliada";

export type ChargeDraft = {
  entryId: string;
  dueDate: string;
  amountCents: number;
  payerDocument: string;
  payerName?: string;
  payerEmail?: string;
  description?: string;
  seuNumero?: string;
};

export function interChargeIdempotencyKey(draft: Pick<ChargeDraft, "entryId" | "dueDate">): string {
  return `inter-charge:${draft.entryId}:${draft.dueDate}`;
}

export function validateChargeDraft(draft: ChargeDraft, environment: "sandbox" | "production" = "sandbox"): string[] {
  const errors: string[] = [];
  if (!draft.entryId) errors.push("Entrada financeira obrigatoria.");
  if (!draft.dueDate) errors.push("Vencimento obrigatorio.");
  if (draft.amountCents <= 0) errors.push("Valor da cobranca deve ser maior que zero.");
  if (!draft.payerDocument) errors.push("Documento do pagador obrigatorio.");
  if (environment === "production" && !draft.payerName) {
    errors.push("Nome do pagador obrigatorio para cobranca real no Banco Inter.");
  }
  return errors;
}

export function mapInterChargeStatus(value: unknown): ChargeStatus {
  const status = String(value ?? "").trim().toUpperCase();
  if (["RECEBIDO", "PAGO", "PAGA", "LIQUIDADO"].includes(status)) return "paga";
  if (["CANCELADO", "CANCELADA"].includes(status)) return "cancelada";
  if (["VENCIDO", "VENCIDA", "EXPIRADO", "EXPIRADA"].includes(status)) return "vencida";
  if (["A_RECEBER", "EMABERTO", "EM_ABERTO", "ATIVO", "ATIVA"].includes(status)) return "aguardando_pagamento";
  if (["EMITIDO", "EMITIDA", "REGISTRADO", "REGISTRADA"].includes(status)) return "emitida";
  return "solicitada";
}
