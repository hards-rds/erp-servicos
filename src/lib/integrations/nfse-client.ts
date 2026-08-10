import { nfseIdempotencyKey, validateNfseDraft, type NfseDraft } from "@/domains/fiscal/nfse";
import {
  interpretNfseResponse,
  normalizeNfseNacionalEndpoint,
  validateDpsInput,
  validateNfseEnvironment,
  type NfseNationalInput,
  type NfseProviderResult
} from "@/lib/integrations/nfse-national";
import {
  signDpsXml,
  transmitDps,
  type NfseRuntimeCertificate
} from "@/lib/integrations/nfse-transport";

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

export async function requestNfseNationalEmission(
  input: NfseNationalInput,
  certificate?: NfseRuntimeCertificate,
  certificateError?: string
): Promise<NfseProviderResult> {
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
      message: "DPS validada. Emissao real bloqueada porque NFSE_REAL_EMISSION nao esta habilitada.",
      protocol: dps.id,
      requestPayload,
      responsePayload: {
        mock: true,
        dpsId: dps.id,
        status: "enfileirada"
      }
    };
  }

  if (!certificate) {
    return {
      ok: false,
      status: "erro_integracao",
      provider: "nfse_nacional",
      message: certificateError || "Certificado digital ativo nao encontrado para esta empresa.",
      requestPayload
    };
  }

  try {
    const signedXml = signDpsXml(dps.xml, certificate);
    const response = await transmitDps({
      endpoint: requestPayload.endpoint as string,
      signedXml,
      certificate
    });
    return {
      ...interpretNfseResponse(response),
      requestPayload
    };
  } catch (error) {
    const payload = error && typeof error === "object" && "payload" in error
      ? (error as { payload?: unknown }).payload
      : undefined;
    const interpreted = payload ? interpretNfseResponse(payload) : null;
    if (interpreted && !interpreted.ok) {
      return { ...interpreted, requestPayload };
    }

    return {
      ok: false,
      status: "erro_integracao",
      provider: "nfse_nacional",
      message: error instanceof Error ? error.message : "Falha ao transmitir a DPS para a SEFIN.",
      requestPayload,
      responsePayload: payload && typeof payload === "object" && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : undefined
    };
  }
}
