import assert from "node:assert/strict";
import test from "node:test";
import forge from "node-forge";
import { DOMParser } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";
import { extractPfxSigningMaterials, parsePfx, PfxValidationError } from "../src/lib/certificates/pfx.ts";
import {
  decryptCertificateSecret,
  encryptCertificateSecret
} from "../src/lib/certificates/secrets.ts";
import {
  decodeNfseXml,
  encodeDpsXml,
  nfseHttpErrorMessage,
  signDpsXml
} from "../src/lib/integrations/nfse-transport.ts";

function createTestPfx(password: string) {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date("2026-01-01T00:00:00.000Z");
  certificate.validity.notAfter = new Date("2027-01-01T00:00:00.000Z");
  certificate.setSubject([{ name: "commonName", value: "Certificado Teste ERP" }]);
  certificate.setIssuer([{ name: "commonName", value: "Certificado Teste ERP" }]);
  certificate.setExtensions([{ name: "basicConstraints", cA: false }]);
  certificate.sign(keys.privateKey, forge.md.sha256.create());

  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [certificate], password, { algorithm: "3des" });
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), "binary");
}

test("abre PFX sem alterar espacos da senha", () => {
  const parsed = parsePfx(createTestPfx(" senha com espaco "), " senha com espaco ");

  assert.deepEqual(parsed, {
    label: "Certificado Teste ERP",
    validUntil: "2027-01-01"
  });
});

test("distingue senha incorreta de certificado invalido", () => {
  const pfx = createTestPfx("senha-correta");

  assert.throws(
    () => parsePfx(pfx, "senha-errada"),
    (error) => error instanceof PfxValidationError && error.code === "invalid_password"
  );
  assert.throws(
    () => parsePfx(Buffer.from("nao-e-pfx"), "senha-correta"),
    (error) => error instanceof PfxValidationError && error.code === "invalid_certificate"
  );
});

test("protege e recupera o certificado com a chave do servidor", () => {
  const previousKey = process.env.CERTIFICATE_ENCRYPTION_KEY;
  process.env.CERTIFICATE_ENCRYPTION_KEY = "chave-de-teste-do-certificado";

  try {
    const encrypted = encryptCertificateSecret("conteudo-sensivel");
    assert.notEqual(encrypted, "conteudo-sensivel");
    assert.equal(decryptCertificateSecret(encrypted), "conteudo-sensivel");

    process.env.CERTIFICATE_ENCRYPTION_KEY = "outra-chave";
    assert.throws(() => decryptCertificateSecret(encrypted), /CERTIFICATE_ENCRYPTION_KEY/);
  } finally {
    if (previousKey === undefined) delete process.env.CERTIFICATE_ENCRYPTION_KEY;
    else process.env.CERTIFICATE_ENCRYPTION_KEY = previousKey;
  }
});

test("assina a DPS com RSA-SHA256 e compacta em GZip Base64", () => {
  const password = "senha-teste";
  const pfx = createTestPfx(password);
  const materials = extractPfxSigningMaterials(pfx, password);
  const xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><DPS xmlns=\"http://www.sped.fazenda.gov.br/nfse\" versao=\"1.01\"><infDPS Id=\"DPS123\"><tpAmb>2</tpAmb></infDPS></DPS>";
  const signedXml = signDpsXml(xml, {
    pfx,
    password,
    certificatePem: materials.certificatePem,
    privateKeyPem: materials.privateKeyPem
  });

  assert.match(signedXml, /rsa-sha256/);
  assert.match(signedXml, /<X509Certificate>/);
  assert.equal(decodeNfseXml(encodeDpsXml(signedXml)), signedXml);

  const verifier = new SignedXml({ publicCert: materials.certificatePem });
  const document = new DOMParser().parseFromString(signedXml);
  const signature = verifier.findSignatures(document)[0];
  assert.ok(signature);
  verifier.loadSignature(signature);
  assert.equal(verifier.checkSignature(signedXml), true);
});

test("traduz indisponibilidade HTTP da SEFIN sem expor HTML", () => {
  const message = nfseHttpErrorMessage(503);
  assert.match(message, /temporariamente indisponivel/);
  assert.match(message, /HTTP 503/);
  assert.doesNotMatch(message, /DOCTYPE|Service Unavailable/);
});
