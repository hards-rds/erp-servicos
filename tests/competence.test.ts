import assert from "node:assert/strict";
import test from "node:test";
import {
  competenceDateRange,
  currentCompetence,
  resolveCompetence,
  shiftCompetence
} from "../src/lib/dates/competence.ts";

test("resolve a competencia atual no fuso da operacao", () => {
  assert.equal(currentCompetence(new Date("2026-09-01T02:30:00.000Z")), "2026-08");
  assert.equal(currentCompetence(new Date("2026-09-01T03:30:00.000Z")), "2026-09");
});

test("aceita apenas competencias validas", () => {
  const date = new Date("2026-09-15T12:00:00.000Z");
  assert.equal(resolveCompetence("2026-02", date), "2026-02");
  assert.equal(resolveCompetence("2026-13", date), "2026-09");
  assert.equal(resolveCompetence("setembro", date), "2026-09");
});

test("navega entre meses e calcula o intervalo exclusivo", () => {
  assert.equal(shiftCompetence("2026-01", -1), "2025-12");
  assert.equal(shiftCompetence("2026-12", 1), "2027-01");
  assert.deepEqual(competenceDateRange("2026-02"), {
    start: "2026-02-01",
    next: "2026-03-01"
  });
});
