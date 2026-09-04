import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync("src/components/finance/entries-batch-table.tsx", "utf8");
const page = readFileSync("src/app/(dashboard)/financeiro/entradas/page.tsx", "utf8");
const route = readFileSync("src/app/api/financeiro/entradas/route.ts", "utf8");

test("entradas permitem selecionar uma, varias ou todas para baixa", () => {
  assert.match(component, /Selecionar todas as entradas em aberto/);
  assert.match(component, /name="entryIds"/);
  assert.match(component, /value="receive_batch"/);
  assert.match(component, /Dar baixa selecionadas/);
  assert.match(component, /selectedEntries\.length/);
  assert.match(component, /selectedTotal/);
  assert.match(component, /disabled=\{!receivable\}/);
  assert.match(page, /<EntriesBatchTable entries=\{tableEntries\} competence=\{competence\} \/>/);
});

test("baixa em lote valida a empresa e registra cada efeito financeiro", () => {
  assert.match(route, /action === "receive_batch"/);
  assert.match(route, /formData\.getAll\("entryIds"\)/);
  assert.match(route, /\.eq\("company_id", profile\.company_id\)[\s\S]*?\.in\("id", entryIds\)/);
  assert.match(route, /received_amount: receivedAmount/);
  assert.match(route, /\.from\("sales"\)[\s\S]*?status: "recebida"/);
  assert.match(route, /metadata: \{ receivedAt, paymentMethod, receivedAmount, batch: true \}/);
  assert.match(route, /"batch_partial"/);
});
