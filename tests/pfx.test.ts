import assert from "node:assert/strict";
import test from "node:test";
import forge from "node-forge";
import { parsePfx, PfxValidationError } from "../src/lib/certificates/pfx.ts";

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
