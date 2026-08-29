import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPilotChecklist, canApprovePilot, pilotProgress, type PilotCheckResult } from "../src/domains/pilot/checklist.ts";

test("checklist combina criterios comuns e especificos sem duplicar", () => {
  const checks = buildPilotChecklist(["tecnologia", "otica"]);
  assert.ok(checks.some((check) => check.key === "tenant_isolation"));
  assert.ok(checks.some((check) => check.key === "technology_contract"));
  assert.ok(checks.some((check) => check.key === "optical_history"));
  assert.equal(new Set(checks.map((check) => check.key)).size, checks.length);
});

test("aprovacao exige todos os obrigatorios e nenhum bloqueador", () => {
  const checks: PilotCheckResult[] = [
    { key: "required", required: true, status: "passed" },
    { key: "optional", required: false, status: "pending" }
  ];
  assert.equal(pilotProgress(checks).percent, 100);
  assert.equal(canApprovePilot(checks, 0), true);
  assert.equal(canApprovePilot(checks, 1), false);
  assert.equal(canApprovePilot([{ key: "required", required: true, status: "failed" }], 0), false);
});

test("persistencia do piloto possui RLS administrativo", () => {
  const migration = readFileSync("supabase/migrations/20260829160000_controlled_pilot.sql", "utf8");
  assert.match(migration, /create table if not exists public\.tenant_pilots/);
  assert.match(migration, /create table if not exists public\.tenant_pilot_checks/);
  assert.match(migration, /public\.app_is_system_admin\(\)/);
  assert.match(migration, /unique \(pilot_id, check_key\)/);
});

test("API revalida administrador e bloqueia aprovacao incompleta", () => {
  const route = readFileSync("src/app/api/admin/pilotos/route.ts", "utf8");
  assert.match(route, /requireSystemAdmin/);
  assert.match(route, /canApprovePilot/);
  assert.match(route, /getTenantPilotReadiness/);
  assert.match(route, /currentCheck\.required && checkStatus === "not_applicable"/);
});
