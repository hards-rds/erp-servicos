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

export function classifyInterConnectionError(value: unknown) {
  const message = (value instanceof Error ? value.message : String(value ?? "")).toLowerCase();
  if (["mac verify failure", "bad decrypt", "invalid password", "passphrase"].some((term) => message.includes(term))) {
    return "inter_pfx_password";
  }
  if (["pkcs12", "asn1", "not enough data", "header too long", "no certificate", "no start line", "pem routines", "key values mismatch"].some((term) => message.includes(term))) {
    return "inter_pfx_invalid";
  }
  if (["403", "escopo", "scope", "insufficient_scope"].some((term) => message.includes(term))) {
    return "inter_scope";
  }
  if (["401", "invalid_client", "login/senha", "unauthorized", "bad certificate", "certificate unknown"].some((term) => message.includes(term))) {
    return "inter_credentials_environment";
  }
  if (["tempo limite", "timeout", "econn", "enotfound", "503", "indisponivel"].some((term) => message.includes(term))) {
    return "inter_unavailable";
  }
  return "connection_error";
}
