import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildNfseIbsCbsXml, calculateCteIbsCbs, inferTaxRegimeCode, isIbsCbsRequired, validateIbsCbsServiceData } from "../src/domains/fiscal/ibs-cbs.ts";

test("aplica o cronograma IBS/CBS por documento e regime", () => {
  assert.equal(isIbsCbsRequired({ documentKind: "cte", environment: "production", taxRegimeCode: "3", issueDate: "2026-08-03" }), true);
  assert.equal(isIbsCbsRequired({ documentKind: "nfse", environment: "production", taxRegimeCode: "3", issueDate: "2026-09-30" }), false);
  assert.equal(isIbsCbsRequired({ documentKind: "nfse", environment: "production", taxRegimeCode: "3", issueDate: "2026-10-01" }), true);
  assert.equal(isIbsCbsRequired({ documentKind: "cte", environment: "production", taxRegimeCode: "1", issueDate: "2026-12-31" }), false);
  assert.equal(isIbsCbsRequired({ documentKind: "cte", environment: "production", taxRegimeCode: "1", issueDate: "2027-01-01" }), true);
  assert.equal(isIbsCbsRequired({ documentKind: "nfse", environment: "homologation", taxRegimeCode: "1" }), true);
});

test("infere o CRT sem sobrescrever configuracao explicita", () => {
  assert.equal(inferTaxRegimeCode({ taxRegimeCode: "2", simpleNationalStatus: "1" }), "2");
  assert.equal(inferTaxRegimeCode({ simpleNationalStatus: "1" }), "3");
  assert.equal(inferTaxRegimeCode({ simpleNationalStatus: "2" }), "4");
  assert.equal(inferTaxRegimeCode({ simpleNationalStatus: "3" }), "1");
});

test("valida e monta o grupo IBS/CBS da DPS", () => {
  const data = { ibsCbsCst: "000", ibsCbsTaxClass: "000001", ibsCbsOperationIndicator: "100101", ibsCbsPresumedCreditCode: "01", ibsCbsFinalConsumer: true };
  assert.deepEqual(validateIbsCbsServiceData(data, true), []);
  const xml = buildNfseIbsCbsXml(data, String);
  assert.match(xml, /<finNFSe>0<\/finNFSe>/);
  assert.match(xml, /<indFinal>1<\/indFinal>/);
  assert.match(xml, /<cIndOp>100101<\/cIndOp>/);
  assert.match(xml, /<CST>000<\/CST>/);
  assert.match(xml, /<cClassTrib>000001<\/cClassTrib>/);
});

test("calcula os valores de transicao do CT-e", () => {
  const result = calculateCteIbsCbs({ baseAmount: 1000, ibsStateRate: 0.1, ibsMunicipalRate: 0, cbsRate: 0.9 });
  assert.equal(result.ibsStateAmount, 1);
  assert.equal(result.ibsAmount, 1);
  assert.equal(result.cbsAmount, 9);
});

test("prepara empresas existentes e novos tenants sem presumir classificacao fiscal", () => {
  const migration = readFileSync("supabase/migrations/20260902170000_ibs_cbs_readiness.sql", "utf8");
  const tenantRoute = readFileSync("src/app/api/admin/tenants/route.ts", "utf8");
  assert.match(migration, /update public\.companies/);
  assert.match(migration, /'ibsStateRate'.*'0\.10'/s);
  assert.match(migration, /'ibsMunicipalRate'.*'0\.00'/s);
  assert.match(migration, /'cbsRate'.*'0\.90'/s);
  assert.match(tenantRoute, /fiscal_settings:\s*\{[\s\S]*taxRegimeCode:\s*""[\s\S]*ibsStateRate:\s*"0\.10"/);
});
