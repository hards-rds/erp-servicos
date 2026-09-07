import crypto from "node:crypto";
import https from "node:https";
import { interChargeIdempotencyKey, validateChargeDraft, type ChargeDraft } from "@/domains/billing/inter";
import type { InterRuntimeCredentials } from "@/lib/integrations/inter-credentials";

type JsonRow = Record<string, unknown>;
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type InterListedCharge = {
  externalId: string;
  seuNumero: string;
  situation: string;
  issuedAt: string;
  dueDate: string;
  amount: number;
  payerName: string;
  payerDocument: string;
  barcode: string;
  digitableLine: string;
  pixCopyPaste: string;
  payload: JsonRow;
};

const productionBaseUrl = "https://cdpj.partners.bancointer.com.br";
const sandboxBaseUrl = "https://cdpj-sandbox.partners.uatinter.co";
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function onlyDigits(value: unknown) {
  return clean(value).replace(/\D/g, "");
}

function money(value: number) {
  return Number((value / 100).toFixed(2));
}

function baseUrl(credentials: InterRuntimeCredentials) {
  return credentials.environment === "production" ? productionBaseUrl : sandboxBaseUrl;
}

function interAgent(credentials: InterRuntimeCredentials) {
  const nativeCertificate = credentials.certificateBase64 && credentials.privateKeyBase64
    ? {
      cert: Buffer.from(credentials.certificateBase64, "base64"),
      key: Buffer.from(credentials.privateKeyBase64, "base64")
    }
    : {};
  const pfxCertificate = credentials.pfxBase64
    ? { pfx: Buffer.from(credentials.pfxBase64, "base64") }
    : {};
  return new https.Agent({
    ...pfxCertificate,
    ...nativeCertificate,
    passphrase: credentials.pfxPassword || undefined,
    minVersion: "TLSv1.2",
    rejectUnauthorized: true
  });
}

function requestJson(options: {
  credentials: InterRuntimeCredentials;
  method: HttpMethod;
  path: string;
  token?: string;
  body?: URLSearchParams | JsonRow;
  accept?: string;
}) {
  const target = new URL(`${baseUrl(options.credentials)}${options.path}`);
  const isForm = options.body instanceof URLSearchParams;
  const body = options.body
    ? options.body instanceof URLSearchParams ? options.body.toString() : JSON.stringify(options.body)
    : "";

  return new Promise<{ statusCode: number; headers: JsonRow; body: Buffer }>((resolve, reject) => {
    const request = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      path: `${target.pathname}${target.search}`,
      method: options.method,
      agent: interAgent(options.credentials),
      headers: {
        accept: options.accept || "application/json",
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.credentials.accountNumber ? { "x-conta-corrente": onlyDigits(options.credentials.accountNumber) } : {}),
        ...(body ? {
          "content-type": isForm ? "application/x-www-form-urlencoded" : "application/json",
          "content-length": Buffer.byteLength(body)
        } : {})
      }
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve({
        statusCode: response.statusCode || 500,
        headers: response.headers as JsonRow,
        body: Buffer.concat(chunks)
      }));
    });

    request.setTimeout(45000, () => request.destroy(new Error("Tempo limite excedido ao comunicar com o Banco Inter.")));
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

function parseJson(buffer: Buffer) {
  if (!buffer.length) return {};
  try {
    return JSON.parse(buffer.toString("utf8")) as JsonRow;
  } catch {
    return { raw: buffer.toString("utf8").slice(0, 500) };
  }
}

function responseError(payload: JsonRow, statusCode: number) {
  const violations = Array.isArray(payload.violacoes)
    ? payload.violacoes.map((item) => {
      const row = item && typeof item === "object" ? item as JsonRow : {};
      return [clean(row.propriedade), clean(row.razao)].filter(Boolean).join(": ");
    }).filter(Boolean).join(" | ")
    : "";
  return [clean(payload.detail || payload.title || payload.raw), violations].filter(Boolean).join(" | ") || `HTTP ${statusCode}`;
}

function tokenCacheKey(credentials: InterRuntimeCredentials) {
  return crypto.createHash("sha256")
    .update(`${credentials.environment}:${credentials.companyId}:${credentials.clientId}`)
    .digest("hex");
}

async function getInterToken(credentials: InterRuntimeCredentials, forceRefresh = false) {
  const cacheKey = tokenCacheKey(credentials);
  const cached = tokenCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    scope: "boleto-cobranca.read boleto-cobranca.write"
  });
  const response = await requestJson({ credentials, method: "POST", path: "/oauth/v2/token", body });
  const payload = parseJson(response.body);
  if (response.statusCode < 200 || response.statusCode >= 300 || !payload.access_token) {
    throw new Error(`Banco Inter recusou autenticacao: ${responseError(payload, response.statusCode)}`);
  }

  const token = clean(payload.access_token);
  const expiresIn = Math.max(60, Number(payload.expires_in || 3600));
  tokenCache.set(cacheKey, { token, expiresAt: Date.now() + expiresIn * 1000 });
  return token;
}

async function authorizedRequest(credentials: InterRuntimeCredentials, options: {
  method: HttpMethod;
  path: string;
  body?: JsonRow;
}) {
  const token = await getInterToken(credentials);
  let response = await requestJson({ credentials, token, ...options });
  if (response.statusCode === 401) {
    response = await requestJson({ credentials, token: await getInterToken(credentials, true), ...options });
  }
  return response;
}

function buildInterChargePayload(draft: ChargeDraft) {
  const payerDocument = onlyDigits(draft.payerDocument);
  return {
    seuNumero: (draft.seuNumero || draft.entryId.replace(/\D/g, "")).slice(0, 15) || Date.now().toString().slice(-15),
    valorNominal: money(draft.amountCents),
    dataVencimento: draft.dueDate,
    numDiasAgenda: 60,
    formasRecebimento: ["BOLETO", "PIX"],
    pagador: {
      cpfCnpj: payerDocument,
      tipoPessoa: payerDocument.length === 11 ? "FISICA" : "JURIDICA",
      nome: draft.payerName || "Pagador",
      ...(draft.payerEmail ? { email: draft.payerEmail } : {})
    },
    mensagem: {
      linha1: (draft.description || "Prestacao de servicos").slice(0, 78)
    }
  };
}

export async function testInterConnection(credentials: InterRuntimeCredentials) {
  await getInterToken(credentials, true);
  return { ok: true, environment: credentials.environment };
}

export async function createInterCharge(draft: ChargeDraft, credentials: InterRuntimeCredentials) {
  const errors = validateChargeDraft(draft, credentials.environment);
  const idempotencyKey = interChargeIdempotencyKey(draft);
  if (errors.length > 0) return { ok: false, status: "erro_integracao" as const, errors, idempotencyKey };
  if (credentials.environment === "production" && !credentials.realChargesEnabled) {
    return {
      ok: false,
      status: "erro_integracao" as const,
      errors: ["Cobranca real bloqueada ate a empresa habilitar explicitamente a producao."],
      idempotencyKey
    };
  }

  const requestPayload = buildInterChargePayload(draft);
  const response = await authorizedRequest(credentials, {
    method: "POST",
    path: "/cobranca/v3/cobrancas",
    body: requestPayload
  });
  const payload = parseJson(response.body);
  const codigoSolicitacao = clean(payload.codigoSolicitacao);
  if (response.statusCode < 200 || response.statusCode >= 300 || !codigoSolicitacao) {
    return {
      ok: false,
      status: "erro_integracao" as const,
      idempotencyKey,
      provider: "inter",
      message: responseError(payload, response.statusCode),
      responsePayload: payload
    };
  }

  return {
    ok: true,
    status: "solicitada" as const,
    idempotencyKey,
    provider: "inter",
    externalId: codigoSolicitacao,
    requestPayload,
    responsePayload: payload
  };
}

export async function getInterCharge(codigoSolicitacao: string, credentials: InterRuntimeCredentials) {
  const response = await authorizedRequest(credentials, {
    method: "GET",
    path: `/cobranca/v3/cobrancas/${encodeURIComponent(codigoSolicitacao)}`
  });
  const payload = parseJson(response.body);
  if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(responseError(payload, response.statusCode));
  return payload;
}

function listedCharge(value: unknown): InterListedCharge | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as JsonRow;
  const charge = payload.cobranca && typeof payload.cobranca === "object" && !Array.isArray(payload.cobranca)
    ? payload.cobranca as JsonRow
    : payload;
  const payer = charge.pagador && typeof charge.pagador === "object" && !Array.isArray(charge.pagador)
    ? charge.pagador as JsonRow
    : {};
  const boleto = payload.boleto && typeof payload.boleto === "object" && !Array.isArray(payload.boleto)
    ? payload.boleto as JsonRow
    : {};
  const pix = payload.pix && typeof payload.pix === "object" && !Array.isArray(payload.pix)
    ? payload.pix as JsonRow
    : {};
  const externalId = clean(charge.codigoSolicitacao || payload.codigoSolicitacao);
  if (!externalId) return null;

  return {
    externalId,
    seuNumero: clean(charge.seuNumero),
    situation: clean(charge.situacao),
    issuedAt: clean(charge.dataEmissao),
    dueDate: clean(charge.dataVencimento),
    amount: Number(String(charge.valorNominal ?? "0").replace(",", ".")) || 0,
    payerName: clean(payer.nome),
    payerDocument: onlyDigits(payer.cpfCnpj),
    barcode: clean(boleto.codigoBarras),
    digitableLine: clean(boleto.linhaDigitavel),
    pixCopyPaste: clean(pix.pixCopiaECola),
    payload
  };
}

export async function listInterCharges(input: {
  from: string;
  to: string;
  maxPages?: number;
}, credentials: InterRuntimeCredentials) {
  const charges: InterListedCharge[] = [];
  const maxPages = Math.max(1, Math.min(input.maxPages || 20, 100));

  for (let page = 0; page < maxPages; page += 1) {
    const query = new URLSearchParams({
      dataInicial: input.from,
      dataFinal: input.to,
      filtrarDataPor: "VENCIMENTO",
      "paginacao.itensPorPagina": "1000",
      "paginacao.paginaAtual": String(page),
      ordenarPor: "DATA_VENCIMENTO",
      tipoOrdenacao: "ASC"
    });
    const response = await authorizedRequest(credentials, {
      method: "GET",
      path: `/cobranca/v3/cobrancas?${query.toString()}`
    });
    const payload = parseJson(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(responseError(payload, response.statusCode));
    }

    const pageCharges = Array.isArray(payload.cobrancas)
      ? payload.cobrancas.map(listedCharge).filter((charge): charge is InterListedCharge => Boolean(charge))
      : [];
    charges.push(...pageCharges);
    const lastPage = payload.ultimaPagina === true;
    const totalPages = Number(payload.totalPaginas || 0);
    if (lastPage || pageCharges.length === 0 || (totalPages > 0 && page + 1 >= totalPages)) break;
  }

  return charges;
}

export async function cancelInterCharge(codigoSolicitacao: string, reason: string, credentials: InterRuntimeCredentials) {
  const response = await authorizedRequest(credentials, {
    method: "POST",
    path: `/cobranca/v3/cobrancas/${encodeURIComponent(codigoSolicitacao)}/cancelar`,
    body: { motivoCancelamento: reason.slice(0, 50) }
  });
  const payload = parseJson(response.body);
  if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(responseError(payload, response.statusCode));
  return payload;
}

export async function downloadInterChargePdf(codigoSolicitacao: string, credentials: InterRuntimeCredentials) {
  const response = await authorizedRequest(credentials, {
    method: "GET",
    path: `/cobranca/v3/cobrancas/${encodeURIComponent(codigoSolicitacao)}/pdf`
  });
  const payload = parseJson(response.body);
  const encoded = clean(payload.pdf || payload.arquivo || payload.base64);
  if (response.statusCode < 200 || response.statusCode >= 300 || !encoded) throw new Error(responseError(payload, response.statusCode));
  return Buffer.from(encoded, "base64");
}

export async function configureInterWebhook(webhookUrl: string, credentials: InterRuntimeCredentials) {
  const response = await authorizedRequest(credentials, {
    method: "PUT",
    path: "/cobranca/v3/cobrancas/webhook",
    body: { webhookUrl }
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(responseError(parseJson(response.body), response.statusCode));
  }
}
