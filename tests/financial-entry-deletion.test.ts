import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getFinancialEntryDeletionBlocker,
  isProtectedInterChargeForEntryDeletion,
  isProtectedNfseForEntryDeletion
} from "../src/domains/finance/entry-deletion.ts";

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

test("protege somente documentos fiscais com efeito legal ou ja enviados", () => {
  for (const status of ["rascunho", "validada", "enfileirada", "rejeitada", "erro_integracao"]) {
    assert.equal(isProtectedNfseForEntryDeletion(status, false), false);
  }
  for (const status of ["enviada", "autorizada", "cancelada"]) {
    assert.equal(isProtectedNfseForEntryDeletion(status, false), true);
  }
  assert.equal(isProtectedNfseForEntryDeletion("rejeitada", true), true);
});

test("remove referencias locais ou canceladas do Inter e preserva cobrancas reais", () => {
  assert.equal(isProtectedInterChargeForEntryDeletion("rascunho", false), false);
  assert.equal(isProtectedInterChargeForEntryDeletion("erro_integracao", false), false);
  assert.equal(isProtectedInterChargeForEntryDeletion("cancelada", true), false);
  assert.equal(isProtectedInterChargeForEntryDeletion("registrada", true), true);
  assert.equal(isProtectedInterChargeForEntryDeletion("erro_integracao", true), true);
  assert.equal(isProtectedInterChargeForEntryDeletion("paga", false), true);
  assert.equal(isProtectedInterChargeForEntryDeletion("conciliada", false), true);
});

test("rota de exclusao exige permissao e limita a empresa ativa", () => {
  const route = readFileSync("src/app/api/financeiro/entradas/route.ts", "utf8");
  const actions = readFileSync("src/components/finance/receive-entry-form.tsx", "utf8");

  assert.match(route, /requireCompanyPermission/);
  assert.match(route, /module: "financeiro\.entradas"/);
  assert.match(route, /action: action === "delete" \? "excluir" : "editar"/);
  assert.match(route, /\.eq\("company_id", profile\.company_id\)/);
  assert.match(route, /\.or\(nfseFilter\)/);
  assert.match(route, /delete_check_error/);
  assert.match(route, /findAuthorizedNfseXml/);
  assert.match(route, /isProtectedInterChargeForEntryDeletion/);
  assert.match(route, /linkedRemovableDocumentIds/);
  assert.match(route, /removableChargeIds/);
  assert.match(actions, /window\.confirm/);
  assert.match(actions, /name="action" value="delete"/);
});
