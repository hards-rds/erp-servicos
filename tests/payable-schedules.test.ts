import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  addMonthsToCompetence,
  payableScheduleLabel,
  splitInstallmentAmount
} from "../src/domains/finance/payable-schedules.ts";

test("divide compra parcelada sem perder centavos", () => {
  const installments = splitInstallmentAmount(1000, 3);
  assert.deepEqual(installments, [333.34, 333.33, 333.33]);
  assert.equal(installments.reduce((sum, amount) => sum + amount, 0), 1000);
  assert.throws(() => splitInstallmentAmount(0.01, 10), /pelo menos um centavo/);
});

test("avanca competencias atravessando anos", () => {
  assert.equal(addMonthsToCompetence("2026-12", 1), "2027-01");
  assert.equal(addMonthsToCompetence("2026-08", 13), "2027-09");
});

test("identifica parcelas, despesas fixas e avulsas", () => {
  assert.equal(payableScheduleLabel({ type: "single" }), "Avulsa");
  assert.equal(payableScheduleLabel({ type: "fixed" }), "Fixa mensal");
  assert.equal(payableScheduleLabel({ type: "installment", installmentNumber: 4, installmentTotal: 10 }), "Parcela 4/10");
});

test("migracao protege tenant, duplicidade e encerramento da serie", () => {
  const migration = readFileSync("supabase/migrations/20260831160000_payable_schedules.sql", "utf8");
  assert.match(migration, /create table if not exists public\.payable_series/);
  assert.match(migration, /public\.company_match\(company_id\)/);
  assert.match(migration, /payables_series_competence_unique/);
  assert.match(migration, /app_create_payable_schedule/);
  assert.match(migration, /ensure_fixed_payable_horizon/);
  assert.match(migration, /app_stop_fixed_payable_series/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
});

test("rota cria series e exige permissao financeira", () => {
  const route = readFileSync("src/app/api/financeiro/saidas/route.ts", "utf8");
  assert.match(route, /app_create_payable_schedule/);
  assert.match(route, /app_stop_fixed_payable_series/);
  assert.match(route, /module: "financeiro\.saidas"/);
  assert.match(route, /target_company_id: profile\.company_id/);
});
