import { nfseIdempotencyKey, validateNfseDraft, type NfseDraft } from "@/domains/fiscal/nfse";

export async function requestNfseEmission(draft: NfseDraft) {
  const errors = validateNfseDraft(draft);
  if (errors.length > 0) {
    return { ok: false, status: "rejeitada" as const, errors };
  }
  if (process.env.NFSE_ENV !== "production") {
    return {
      ok: true,
      status: "enfileirada" as const,
      idempotencyKey: nfseIdempotencyKey(draft),
      provider: "nfse-sandbox-mock"
    };
  }
  throw new Error("Emissao NFS-e em producao exige autorizacao explicita.");
}
