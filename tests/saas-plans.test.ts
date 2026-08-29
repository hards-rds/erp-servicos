import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PLAN_DEFINITIONS,
  capacityAvailable,
  isPlanLimitError,
  planDefinition,
  usagePercentage
} from "../src/domains/billing/saas-plans.ts";

test("planos comerciais possuem limites crescentes e recursos explicitos", () => {
  assert.equal(PLAN_DEFINITIONS.starter.limits.companies, 1);
  assert.equal(PLAN_DEFINITIONS.pro.limits.companies, 3);
  assert.equal(PLAN_DEFINITIONS.enterprise.limits.companies, null);
  assert.equal(PLAN_DEFINITIONS.starter.features.api_integrations, false);
  assert.equal(PLAN_DEFINITIONS.pro.features.api_integrations, true);
  assert.equal(planDefinition("desconhecido").code, "starter");
});

test("capacidade permite ilimitado e bloqueia quando o teto e atingido", () => {
  assert.equal(capacityAvailable(1000, 1000), false);
  assert.equal(capacityAvailable(999, 1000), true);
  assert.equal(capacityAvailable(50000, null), true);
  assert.equal(usagePercentage(800, 1000), 80);
  assert.equal(usagePercentage(1200, 1000), 100);
  assert.equal(isPlanLimitError({ message: "plan_limit:clients:1000:1000" }), true);
});

test("migracao separa assinatura SaaS e aplica protecao transacional", () => {
  const migration = readFileSync("supabase/migrations/20260829150000_saas_plans_and_subscriptions.sql", "utf8");
  assert.match(migration, /create table if not exists public\.tenant_subscriptions/);
  assert.match(migration, /create table if not exists public\.saas_invoices/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /plan_limit:/);
  assert.match(migration, /public\.tenant_match\(tenant_id\)/);
  assert.doesNotMatch(migration, /financial_entries|payables/);
});

test("rotas criticas consultam capacidade antes de criar", () => {
  for (const file of [
    "src/app/api/cadastros/clientes/route.ts",
    "src/app/api/cadastros/catalogo-servicos/route.ts",
    "src/app/api/cadastros/contratos/route.ts",
    "src/app/api/operacao/estoque/route.ts",
    "src/app/api/escola/matriculas/route.ts",
    "src/app/api/users/route.ts"
  ]) {
    assert.match(readFileSync(file, "utf8"), /canCreateTenantResource/, `${file} precisa validar o plano`);
  }
});
