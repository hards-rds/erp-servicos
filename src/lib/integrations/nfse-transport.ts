import https from "node:https";
import { gzipSync, gunzipSync } from "node:zlib";
import { SignedXml } from "xml-crypto";

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";
const maxResponseBytes = 8 * 1024 * 1024;

export type NfseRuntimeCertificate = {
  pfx: Buffer;
  password: string;
  certificatePem: string;
  privateKeyPem: string;
};

export function signDpsXml(xml: string, certificate: NfseRuntimeCertificate) {
  return signXmlElement(xml, certificate, "infDPS");
}

export function signCancellationXml(xml: string, certificate: NfseRuntimeCertificate) {
  return signXmlElement(xml, certificate, "infPedReg");
}

function signXmlElement(xml: string, certificate: NfseRuntimeCertificate, elementName: string) {
  const signer = new SignedXml({
    privateKey: certificate.privateKeyPem,
    publicCert: certificate.certificatePem,
    signatureAlgorithm: RSA_SHA256,
    canonicalizationAlgorithm: C14N
  });

  signer.addReference({
    xpath: `//*[local-name(.)='${elementName}']`,
    digestAlgorithm: SHA256,
    transforms: [ENVELOPED, C14N]
  });
  signer.computeSignature(xml, {
    location: {
      reference: `//*[local-name(.)='${elementName}']`,
      action: "after"
    }
  });
  return signer.getSignedXml();
}

export function encodeDpsXml(xml: string) {
  return gzipSync(Buffer.from(xml, "utf8")).toString("base64");
}

export function decodeNfseXml(value: string) {
  return gunzipSync(Buffer.from(value, "base64")).toString("utf8");
}

function parseResponseBody(body: string): unknown {
  if (!body.trim()) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`A SEFIN retornou uma resposta invalida: ${body.slice(0, 300)}`);
  }
}

export function nfseHttpErrorMessage(statusCode: number) {
  if ([502, 503, 504].includes(statusCode)) {
    return `A SEFIN Nacional esta temporariamente indisponivel (HTTP ${statusCode}). Tente emitir novamente em alguns minutos.`;
  }
  return `A SEFIN Nacional recusou a comunicacao (HTTP ${statusCode}). Tente novamente ou consulte a disponibilidade do servico.`;
}

export function transmitDps(options: {
  endpoint: string;
  signedXml: string;
  certificate: NfseRuntimeCertificate;
  timeoutMs?: number;
}) {
  const target = new URL(`${options.endpoint.replace(/\/$/, "")}/nfse`);
  const body = JSON.stringify({ dpsXmlGZipB64: encodeDpsXml(options.signedXml) });

  return postNfseJson(target, body, options.certificate, options.timeoutMs);
}

export function transmitCancellation(options: {
  endpoint: string;
  accessKey: string;
  signedXml: string;
  certificate: NfseRuntimeCertificate;
  timeoutMs?: number;
}) {
  const target = new URL(`${options.endpoint.replace(/\/$/, "")}/nfse/${encodeURIComponent(options.accessKey)}/eventos`);
  const body = JSON.stringify({ pedidoRegistroEventoXmlGZipB64: encodeDpsXml(options.signedXml) });

  return postNfseJson(target, body, options.certificate, options.timeoutMs);
}

function postNfseJson(target: URL, body: string, certificate: NfseRuntimeCertificate, timeoutMs?: number) {
  return new Promise<unknown>((resolve, reject) => {
    const req = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      path: `${target.pathname}${target.search}`,
      method: "POST",
      pfx: certificate.pfx,
      passphrase: certificate.password,
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
      headers: {
        accept: "application/json",
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(body)
      }
    }, (response) => {
      const chunks: Buffer[] = [];
      let received = 0;

      response.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > maxResponseBytes) {
          req.destroy(new Error("A resposta da SEFIN excedeu o limite permitido."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        const rawBody = Buffer.concat(chunks).toString("utf8");
        const statusCode = response.statusCode || 500;

        if (statusCode < 200 || statusCode >= 300) {
          const error = new Error(nfseHttpErrorMessage(statusCode)) as Error & { payload?: unknown };
          try {
            const payload = parseResponseBody(rawBody);
            if (payload && typeof payload === "object" && !Array.isArray(payload)) {
              error.payload = payload;
            }
          } catch {
            // Proxies da SEFIN podem responder HTML durante indisponibilidades.
          }
          reject(error);
          return;
        }

        try {
          resolve(parseResponseBody(rawBody));
        } catch (error) {
          reject(error);
        }
      });
    });

    req.setTimeout(timeoutMs ?? 45000, () => {
      req.destroy(new Error("Tempo limite excedido ao transmitir a DPS para a SEFIN."));
    });
    req.on("error", reject);
    req.end(body);
  });
}
