import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canEditPayable, canMarkPayablePaid, getPayableMutationBlocker } from "../src/domains/finance/payables.ts";

test("permite editar e pagar somente saidas ainda abertas", () => {
  assert.equal(canEditPayable("previsto"), true);
  assert.equal(canEditPayable("aprovado"), true);
  assert.equal(canEditPayable("pago"), false);
  assert.equal(canEditPayable("conciliado"), false);
  assert.equal(canMarkPayablePaid("vencido"), true);
  assert.equal(canMarkPayablePaid("cancelado"), false);
});

test("bloqueia alteracao de saida liquidada ou gerada por outro modulo", () => {
  assert.equal(getPayableMutationBlocker({ status: "pago", commissionCount: 0, reconciliationCount: 0 }), "settled");
  assert.equal(getPayableMutationBlocker({ status: "aprovado", commissionCount: 1, reconciliationCount: 0 }), "linked");
  assert.equal(getPayableMutationBlocker({ status: "aprovado", commissionCount: 0, reconciliationCount: 1 }), "linked");
  assert.equal(getPayableMutationBlocker({ status: "aprovado", commissionCount: 0, reconciliationCount: 0 }), null);
});

test("rota exige permissao e escopo da empresa ativa", () => {
  const route = readFileSync("src/app/api/financeiro/saidas/route.ts", "utf8");
  assert.match(route, /permission_module: "financeiro\.saidas"/);
  assert.match(route, /permission_action: permissionAction/);
  assert.match(route, /\.eq\("company_id", profile\.company_id\)/);
  assert.match(route, /status: "pago"/);
  assert.match(route, /paid_at: paidAt/);
});
