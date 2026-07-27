import { nfseIdempotencyKey, validateNfseDraft, type NfseDraft } from "@/domains/fiscal/nfse";
import {
  interpretNfseResponse,
  normalizeNfseNacionalEndpoint,
  validateDpsInput,
  validateNfseEnvironment,
  type NfseNationalInput,
  type NfseProviderResult
} from "@/lib/integrations/nfse-national";

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

export async function requestNfseNationalEmission(input: NfseNationalInput): Promise<NfseProviderResult> {
  const { dps, errors } = validateDpsInput(input);
  const endpoint = normalizeNfseNacionalEndpoint(process.env.NFSE_NACIONAL_ENDPOINT || "");
  const environment = process.env.NFSE_ENV === "production" ? "production" : "homologation";
  const environmentError = validateNfseEnvironment(environment, endpoint || "https://sefin.producaorestrita.nfse.gov.br/SefinNacional");
  const requestPayload = {
    provider: "nfse_nacional",
    environment,
    endpoint: endpoint || "https://sefin.producaorestrita.nfse.gov.br/SefinNacional",
    dpsId: dps.id,
    dpsNumber: dps.number,
    dpsSeries: dps.series,
    cityCode: dps.cityCode,
    serviceCode: dps.serviceCode,
    dpsXml: dps.xml
  };

  if (errors.length || environmentError) {
    return {
      ok: false,
      status: "rejeitada",
      provider: "nfse_nacional",
      message: [...errors, environmentError].filter(Boolean).join(" "),
      requestPayload
    };
  }

  if (process.env.NFSE_REAL_EMISSION !== "true") {
    return {
      ok: true,
      status: "enfileirada",
      provider: "nfse-nacional-sandbox-mock",
      message: "DPS validada e preparada. Emissao real bloqueada ate configurar certificado e NFSE_REAL_EMISSION=true.",
      protocol: dps.id,
      requestPayload,
      responsePayload: {
        mock: true,
        dpsId: dps.id,
        status: "enfileirada"
      }
    };
  }

  return interpretNfseResponse({
    protocolo: dps.id,
    status: "enfileirada",
    message: "Transmissao real ainda exige cliente mTLS/certificado no runtime Next."
  });
}
