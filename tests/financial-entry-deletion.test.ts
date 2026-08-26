import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getFinancialEntryDeletionBlocker } from "../src/domains/finance/entry-deletion.ts";

const availableEntry = {
  status: "previsto",
  receivedAt: null,
  nfseCount: 0,
  chargeCount: 0,
  reconciliationCount: 0,
  saleCount: 0
};

test("permite excluir entrada ainda nao liquidada e sem vinculos", () => {
  assert.equal(getFinancialEntryDeletionBlocker(availableEntry), null);
});

test("preserva entradas recebidas ou conciliadas", () => {
  assert.equal(getFinancialEntryDeletionBlocker({ ...availableEntry, status: "recebido" }), "settled");
  assert.equal(getFinancialEntryDeletionBlocker({ ...availableEntry, status: "conciliado" }), "settled");
  assert.equal(getFinancialEntryDeletionBlocker({ ...availableEntry, receivedAt: "2026-08-26" }), "settled");
});

test("preserva entradas vinculadas a documentos ou operacoes", () => {
  assert.equal(getFinancialEntryDeletionBlocker({ ...availableEntry, nfseCount: 1 }), "nfse");
  assert.equal(getFinancialEntryDeletionBlocker({ ...availableEntry, chargeCount: 1 }), "charge");
  assert.equal(getFinancialEntryDeletionBlocker({ ...availableEntry, reconciliationCount: 1 }), "reconciliation");
  assert.equal(getFinancialEntryDeletionBlocker({ ...availableEntry, saleCount: 1 }), "sale");
});

test("referencias antigas sem documento real nao bloqueiam a exclusao", () => {
  assert.equal(getFinancialEntryDeletionBlocker(availableEntry), null);
});

test("rota de exclusao exige permissao e limita a empresa ativa", () => {
  const route = readFileSync("src/app/api/financeiro/entradas/route.ts", "utf8");
  const actions = readFileSync("src/components/finance/receive-entry-form.tsx", "utf8");

  assert.match(route, /permission_module: "financeiro\.entradas"/);
  assert.match(route, /permission_action: "excluir"/);
  assert.match(route, /\.eq\("company_id", profile\.company_id\)/);
  assert.match(route, /\.or\(nfseFilter\)/);
  assert.match(route, /delete_check_error/);
  assert.match(actions, /window\.confirm/);
  assert.match(actions, /name="action" value="delete"/);
});
