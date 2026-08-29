import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildOnboardingSteps,
  onboardingProgress,
  type OnboardingSignals
} from "../src/lib/onboarding/checklist.ts";

const emptySignals: OnboardingSignals = {
  companyIdentity: false,
  accessConfigured: false,
  clients: 0,
  services: 0,
  products: 0,
  contracts: 0,
  financialEntries: 0,
  schoolAthletes: 0,
  schoolClasses: 0,
  schoolEnrollments: 0,
  fiscalConfigured: false,
  emailConfigured: false
};

test("onboarding monta etapas proprias para cada segmento", () => {
  const technology = buildOnboardingSteps("tecnologia", emptySignals).map((step) => step.id);
  const optical = buildOnboardingSteps("otica", emptySignals).map((step) => step.id);
  const school = buildOnboardingSteps("escola_futebol", emptySignals).map((step) => step.id);

  assert.deepEqual(technology.slice(0, 5), ["company", "access", "clients", "services", "contracts"]);
  assert.ok(optical.includes("products"));
  assert.ok(school.includes("classes"));
  assert.ok(school.includes("athletes"));
  assert.ok(school.includes("enrollments"));
  assert.ok(!school.includes("fiscal"));
});

test("progresso considera somente etapas obrigatorias", () => {
  const steps = buildOnboardingSteps("tecnologia", {
    ...emptySignals,
    companyIdentity: true,
    accessConfigured: true,
    clients: 1,
    services: 1,
    contracts: 1
  });
  const progress = onboardingProgress(steps);

  assert.equal(progress.completed, 5);
  assert.equal(progress.total, 5);
  assert.equal(progress.percent, 100);
  assert.equal(steps.find((step) => step.id === "fiscal")?.complete, false);
});

test("tela calcula os sinais dentro da empresa ativa e exige permissao", () => {
  const source = readFileSync("src/app/(dashboard)/configuracoes/onboarding/page.tsx", "utf8");
  assert.match(source, /requireCompanyPermission/);
  assert.match(source, /module: "configuracoes\.gerais"/);
  assert.match(source, /\.eq\("company_id", companyId\)/);
  assert.match(source, /buildOnboardingSteps/);
});
