import assert from "node:assert/strict";
import test from "node:test";
import { compareTableValues, compareTableValuesInDirection, sortDirectionMultiplier } from "../src/lib/table-sort.ts";

test("ordenacao trata textos em portugues sem diferenciar acentos e caixa", () => {
  const values = ["Zeta", "acucar", "Ábaco", "Aço Forte"];
  assert.deepEqual(values.sort(compareTableValues), ["Ábaco", "Aço Forte", "acucar", "Zeta"]);
});

test("ordenacao compara moeda brasileira pelo valor numerico", () => {
  const values = ["R$ 960,00", "R$ 7.000,00", "R$ 170,00", "R$ 1.900,00"];
  assert.deepEqual(values.sort(compareTableValues), ["R$ 170,00", "R$ 960,00", "R$ 1.900,00", "R$ 7.000,00"]);
});

test("ordenacao compara datas, competencias e dias de vencimento", () => {
  assert.ok(compareTableValues("10/08/2026", "20/08/2026") < 0);
  assert.ok(compareTableValues("2026-08", "2026-09") < 0);
  assert.ok(compareTableValues("Dia 10", "Dia 20") < 0);
});

test("valores vazios permanecem no fim da lista", () => {
  assert.ok(compareTableValues("-", "Ativo") > 0);
  assert.ok(compareTableValues("", "R$ 1,00") > 0);
});

test("direcao decrescente inverte o comparador", () => {
  assert.equal(sortDirectionMultiplier("ascending"), 1);
  assert.equal(sortDirectionMultiplier("descending"), -1);
  assert.ok(compareTableValuesInDirection("R$ 10,00", "R$ 5,00", "descending") < 0);
  assert.ok(compareTableValuesInDirection("-", "R$ 5,00", "descending") > 0);
});
