import { interChargeIdempotencyKey, validateChargeDraft, type ChargeDraft } from "@/domains/billing/inter";
import fs from "node:fs";
import https from "node:https";

type JsonRow = Record<string, unknown>;

const productionBaseUrl = "https://cdpj.partners.bancointer.com.br";
const sandboxBaseUrl = "https://cdpj-sandbox.partners.uatinter.co";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function onlyDigits(value: unknown) {
  return clean(value).replace(/\D/g, "");
}

function money(value: number) {
  return (value / 100).toFixed(2);
}

function baseUrl() {
  return process.env.INTER_ENV === "production" ? productionBaseUrl : sandboxBaseUrl;
}

function readBase64(value: string) {
  return Buffer.from(value, "base64");
}

function interAgent() {
  const pfxBase64 = clean(process.env.INTER_PFX_BASE64);
  const pfxPath = clean(process.env.INTER_CERT_PATH);
  const passphrase = clean(process.env.INTER_CERT_PASSWORD);

  const pfx = pfxBase64 ? readBase64(pfxBase64) : (pfxPath ? fs.readFileSync(pfxPath) : null);
  if (!pfx) {
    throw new Error("Certificado mTLS do Banco Inter nao configurado. Defina INTER_PFX_BASE64 ou INTER_CERT_PATH.");
  }

  return new https.Agent({
    pfx,
    passphrase: passphrase || undefined,
    minVersion: "TLSv1.2",
    rejectUnauthorized: true
  });
}

function requestJson(options: {
  method: "GET" | "POST";
  path: string;
  token?: string;
  body?: URLSearchParams | JsonRow;
  accept?: string;
}) {
  const target = new URL(`${baseUrl()}${options.path}`);
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
      agent: interAgent(),
      headers: {
        accept: options.accept || "application/json",
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(body ? {
          "content-type": isForm ? "application/x-www-form-urlencoded" : "application/json",
          "content-length": Buffer.byteLength(body)
        } : {})
      }
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode || 500,
          headers: response.headers as JsonRow,
          body: Buffer.concat(chunks)
        });
      });
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
    return { raw: buffer.toString("utf8").slice(0, 300) };
  }
}

async function getInterToken() {
  const clientId = clean(process.env.INTER_CLIENT_ID);
  const clientSecret = clean(process.env.INTER_CLIENT_SECRET);
  if (!clientId || !clientSecret) throw new Error("Client ID/Secret do Banco Inter nao configurados.");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "boleto-cobranca.read boleto-cobranca.write"
  });
  const response = await requestJson({ method: "POST", path: "/oauth/v2/token", body });
  const payload = parseJson(response.body);
  if (response.statusCode < 200 || response.statusCode >= 300 || !payload.access_token) {
    throw new Error(`Banco Inter recusou autenticacao: ${clean(payload.detail || payload.title || payload.raw) || `HTTP ${response.statusCode}`}`);
  }
  return clean(payload.access_token);
}

function buildInterChargePayload(draft: ChargeDraft) {
  const payerDocument = onlyDigits(draft.payerDocument);
  return {
    seuNumero: (draft.seuNumero || draft.entryId).slice(0, 15),
    valorNominal: money(draft.amountCents),
    dataVencimento: draft.dueDate,
    numDiasAgenda: 60,
    formasRecebimento: ["BOLETO", "PIX"],
    pagador: {
      cpfCnpj: payerDocument,
      tipoPessoa: payerDocument.length === 11 ? "FISICA" : "JURIDICA",
      nome: draft.payerName || "Pagador"
    },
    mensagem: {
      linha1: draft.description || "Prestacao de servicos"
    }
  };
}

export async function createInterCharge(draft: ChargeDraft) {
  const errors = validateChargeDraft(draft);
  if (errors.length > 0) {
    return { ok: false, status: "erro_integracao" as const, errors };
  }
  const idempotencyKey = interChargeIdempotencyKey(draft);
  if (process.env.INTER_ENV !== "production") {
    return {
      ok: true,
      status: "solicitada" as const,
      idempotencyKey,
      provider: "inter-sandbox-mock"
    };
  }
  if (process.env.INTER_REAL_CHARGE !== "true") {
    return {
      ok: true,
      status: "solicitada" as const,
      idempotencyKey,
      provider: "inter-production-guard",
      message: "Cobranca real bloqueada porque INTER_REAL_CHARGE nao esta habilitado."
    };
  }

  const token = await getInterToken();
  const response = await requestJson({
    method: "POST",
    path: "/cobranca/v3/cobrancas",
    token,
    body: buildInterChargePayload(draft)
  });
  const payload = parseJson(response.body);
  const codigoSolicitacao = clean(payload.codigoSolicitacao);
  if (response.statusCode < 200 || response.statusCode >= 300 || !codigoSolicitacao) {
    return {
      ok: false,
      status: "erro_integracao" as const,
      idempotencyKey,
      provider: "inter",
      message: clean(payload.detail || payload.title || payload.raw) || `Banco Inter recusou a cobranca (HTTP ${response.statusCode}).`,
      responsePayload: payload
    };
  }

  return {
    ok: true,
    status: "solicitada" as const,
    idempotencyKey,
    provider: "inter",
    externalId: codigoSolicitacao,
    responsePayload: payload
  };
}

export async function downloadInterChargePdf(codigoSolicitacao: string) {
  const token = await getInterToken();
  const response = await requestJson({
    method: "GET",
    path: `/cobranca/v3/cobrancas/${encodeURIComponent(codigoSolicitacao)}/pdf`,
    token
  });
  const payload = parseJson(response.body);
  const encoded = clean(payload.pdf || payload.arquivo || payload.base64);
  if (response.statusCode < 200 || response.statusCode >= 300 || !encoded) {
    throw new Error(clean(payload.detail || payload.title || payload.raw) || `Banco Inter nao retornou o PDF (HTTP ${response.statusCode}).`);
  }
  return Buffer.from(encoded, "base64");
}
