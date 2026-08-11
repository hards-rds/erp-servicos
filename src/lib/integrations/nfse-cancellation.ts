import {
  normalizeNfseNacionalEndpoint,
  validateNfseEnvironment,
  type NfseProviderResult
} from "./nfse-national.ts";
import {
  signCancellationXml,
  transmitCancellation,
  type NfseRuntimeCertificate
} from "./nfse-transport.ts";

type Row = Record<string, unknown>;

export type NfseCancellationReasonCode = "1" | "2" | "9";

export type NfseCancellationInput = {
  accessKey: string;
  companyDocument: string;
  reasonCode: NfseCancellationReasonCode;
  reason: string;
};

const cancellationCodes = new Set<NfseCancellationReasonCode>(["1", "2", "9"]);

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function onlyDigits(value: unknown) {
  return clean(value).replace(/\D/g, "");
}

function xml(value: unknown) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function eventDateTime() {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date()).replace(" ", "T");
  return `${parts}-03:00`;
}

function responseErrors(payload: Row) {
  const raw = Array.isArray(payload.erros)
    ? payload.erros
    : Array.isArray(payload.erro)
      ? payload.erro
      : payload.erro && typeof payload.erro === "object"
        ? [payload.erro]
        : [];

  return raw.map((item) => {
    const error = item && typeof item === "object" && !Array.isArray(item) ? item as Row : {};
    const code = clean(error.Codigo || error.codigo);
    const description = clean(error.Descricao || error.descricao);
    const detail = clean(error.Complemento || error.complemento);
    return [code, description, detail].filter(Boolean).join(" - ");
  }).filter(Boolean);
}

export function buildCancellationXml(input: NfseCancellationInput) {
  const accessKey = onlyDigits(input.accessKey);
  const companyDocument = onlyDigits(input.companyDocument);
  const environment = process.env.NFSE_ENV === "production" ? "production" : "homologation";
  const id = `PRE${accessKey}101101`;

  return {
    id,
    accessKey,
    companyDocument,
    environment,
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">
  <infPedReg Id="${xml(id)}">
    <tpAmb>${environment === "production" ? "1" : "2"}</tpAmb>
    <verAplic>erp-servicos-1.0</verAplic>
    <dhEvento>${xml(eventDateTime())}</dhEvento>
    <CNPJAutor>${xml(companyDocument)}</CNPJAutor>
    <chNFSe>${xml(accessKey)}</chNFSe>
    <e101101>
      <xDesc>Cancelamento de NFS-e</xDesc>
      <cMotivo>${xml(input.reasonCode)}</cMotivo>
      <xMotivo>${xml(input.reason)}</xMotivo>
    </e101101>
  </infPedReg>
</pedRegEvento>`
  };
}

export function validateCancellationInput(input: NfseCancellationInput) {
  const cancellation = buildCancellationXml(input);
  const reason = clean(input.reason);
  const errors: string[] = [];

  if (!/^\d{50}$/.test(cancellation.accessKey)) errors.push("Chave de acesso da NFS-e invalida.");
  if (!/^\d{14}$/.test(cancellation.companyDocument)) errors.push("CNPJ do emitente invalido.");
  if (!cancellationCodes.has(input.reasonCode)) errors.push("Motivo de cancelamento invalido.");
  if (reason.length < 15 || reason.length > 255) errors.push("A justificativa deve ter entre 15 e 255 caracteres.");

  return { cancellation, errors };
}

export function interpretCancellationResponse(body: unknown): NfseProviderResult {
  const payload = body && typeof body === "object" && !Array.isArray(body) ? body as Row : {};
  const errors = responseErrors(payload);
  const authorized = Boolean(clean(payload.eventoXmlGZipB64));

  if (errors.length || !authorized) {
    return {
      ok: false,
      status: "erro_integracao",
      provider: "nfse_nacional",
      message: errors.join(" | ") || "A SEFIN nao confirmou o cancelamento da NFS-e.",
      responsePayload: payload
    };
  }

  return {
    ok: true,
    status: "cancelada",
    provider: "nfse_nacional",
    message: "NFS-e cancelada e evento autorizado pela SEFIN.",
    responsePayload: payload
  };
}

export async function requestNfseCancellation(
  input: NfseCancellationInput,
  certificate?: NfseRuntimeCertificate,
  certificateError?: string
): Promise<NfseProviderResult> {
  const { cancellation, errors } = validateCancellationInput(input);
  const endpoint = normalizeNfseNacionalEndpoint(process.env.NFSE_NACIONAL_ENDPOINT || "");
  const environmentError = validateNfseEnvironment(cancellation.environment, endpoint || "https://sefin.producaorestrita.nfse.gov.br/SefinNacional");
  const requestPayload = {
    provider: "nfse_nacional",
    environment: cancellation.environment,
    endpoint: endpoint || "https://sefin.producaorestrita.nfse.gov.br/SefinNacional",
    accessKey: cancellation.accessKey,
    eventId: cancellation.id,
    eventCode: "101101",
    reasonCode: input.reasonCode,
    reason: clean(input.reason),
    eventXml: cancellation.xml
  };

  if (errors.length || environmentError) {
    return {
      ok: false,
      status: "erro_integracao",
      provider: "nfse_nacional",
      message: [...errors, environmentError].filter(Boolean).join(" "),
      requestPayload
    };
  }

  if (process.env.NFSE_REAL_EMISSION !== "true") {
    return {
      ok: false,
      status: "erro_integracao",
      provider: "nfse_nacional",
      message: "Cancelamento real bloqueado porque NFSE_REAL_EMISSION nao esta habilitada.",
      requestPayload
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
    const signedXml = signCancellationXml(cancellation.xml, certificate);
    const response = await transmitCancellation({
      endpoint: requestPayload.endpoint,
      accessKey: cancellation.accessKey,
      signedXml,
      certificate
    });
    return { ...interpretCancellationResponse(response), requestPayload };
  } catch (error) {
    const payload = error && typeof error === "object" && "payload" in error
      ? (error as { payload?: unknown }).payload
      : undefined;
    const interpreted = payload ? interpretCancellationResponse(payload) : null;
    if (interpreted && !interpreted.ok) return { ...interpreted, requestPayload };

    return {
      ok: false,
      status: "erro_integracao",
      provider: "nfse_nacional",
      message: error instanceof Error ? error.message : "Falha ao transmitir o cancelamento para a SEFIN.",
      requestPayload,
      responsePayload: payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Row : undefined
    };
  }
}
