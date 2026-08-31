import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateContractorCompensation, contractorCommissionBasisLabel } from "../src/domains/people/contractor-compensation.ts";

const read = (path: string) => readFileSync(path, "utf8");

test("fecha remuneracao PJ com fixo, ajuda e percentual sobre contratos", () => {
  const result = calculateContractorCompensation({
    fixedAmount: 3000,
    costAllowanceAmount: 500,
    commissionRate: 2.5,
    commissionItems: [2500, 1175, 1900]
  });
  assert.deepEqual(result, {
    commissionBase: 5575,
    commissionAmount: 139.38,
    totalAmount: 3639.38
  });
});

test("aceita desconto de fechamento sem perder precisao monetaria", () => {
  const result = calculateContractorCompensation({
    fixedAmount: 1000,
    costAllowanceAmount: 200,
    commissionRate: 1.25,
    commissionItems: [333.33, 666.67],
    adjustments: -50
  });
  assert.equal(result.commissionAmount, 12.5);
  assert.equal(result.totalAmount, 1162.5);
  assert.equal(contractorCommissionBasisLabel("received"), "Contratos recebidos no mes");
});

test("migracao PJ isola tenants, congela aprovados e integra contas a pagar", () => {
  const migration = read("supabase/migrations/20260831173000_contractor_compensations.sql");
  for (const table of ["contractors", "contractor_compensations", "contractor_compensation_items"]) {
    assert.match(migration, new RegExp(`create policy ${table}_[\\s\\S]*?public\\.company_match\\(company_id\\)`));
  }
  assert.match(migration, /tax_id text not null check \(tax_id ~ '\^\\d\{14\}\$'\)/);
  assert.match(migration, /contractor_compensation_locked/);
  assert.match(migration, /app_generate_contractor_compensation/);
  assert.match(migration, /app_approve_contractor_compensation/);
  assert.match(migration, /'Prestadores PJ'/);
  assert.match(migration, /payables_sync_contractor_compensation/);
});

test("API exige CNPJ, permissao e empresa ativa para prestadores", () => {
  const route = read("src/app/api/pessoas/colaboradores/route.ts");
  assert.match(route, /module: "pessoas\.colaboradores"/);
  assert.match(route, /isValidCnpj\(taxId\)/);
  assert.match(route, /company_id: profile\.company_id/);
  assert.match(route, /\.eq\("company_id", profile\.company_id\)/);
  assert.match(route, /app_generate_contractor_compensation/);
  assert.match(route, /app_approve_contractor_compensation/);
  assert.match(route, /writeCompanyAudit/);
});

test("conta do fechamento pode ser paga, mas nao editada fora do modulo PJ", () => {
  const page = read("src/app/(dashboard)/financeiro/saidas/page.tsx");
  const route = read("src/app/api/financeiro/saidas/route.ts");
  assert.match(page, /protectedEditPayableIds/);
  assert.match(page, /contractor_compensations/);
  assert.doesNotMatch(page, /canPay=\{[^}]*protectedEditPayableIds/);
  assert.match(route, /action === "update" && \(contractorCompensationResult\.count \|\| 0\) > 0/);
});
