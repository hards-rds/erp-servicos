import { interChargeIdempotencyKey, validateChargeDraft, type ChargeDraft } from "@/domains/billing/inter";

export async function createInterCharge(draft: ChargeDraft) {
  const errors = validateChargeDraft(draft);
  if (errors.length > 0) {
    return { ok: false, status: "erro_integracao" as const, errors };
  }
  if (process.env.INTER_ENV !== "production") {
    return {
      ok: true,
      status: "solicitada" as const,
      idempotencyKey: interChargeIdempotencyKey(draft),
      provider: "inter-sandbox-mock"
    };
  }
  throw new Error("Cobranca Banco Inter em producao exige autorizacao explicita.");
}
