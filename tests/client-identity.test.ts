import assert from "node:assert/strict";
import test from "node:test";
import {
  formatBrazilianDocument,
  getClientIdentityLabel,
  getClientLocation
} from "../src/lib/client-identity.ts";

test("formata CNPJ e CPF", () => {
  assert.equal(formatBrazilianDocument("04329643000215"), "04.329.643/0002-15");
  assert.equal(formatBrazilianDocument("06062716609"), "060.627.166-09");
});

test("aceita as chaves de cidade e estado usadas nos cadastros", () => {
  assert.equal(getClientLocation({ city: "Uberlandia", state: "mg" }), "Uberlandia/MG");
  assert.equal(getClientLocation({ municipio: "Araguari", uf: "MG" }), "Araguari/MG");
});

test("monta uma identificacao segura para filiais", () => {
  assert.equal(getClientIdentityLabel({
    legal_name: "CLIENTE MATRIZ LTDA",
    document: "04329643000215",
    address: { city: "Uberlandia", state: "MG" }
  }), "CLIENTE MATRIZ LTDA - 04.329.643/0002-15 - Uberlandia/MG");
});
