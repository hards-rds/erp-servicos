import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260827104500_delete_sales_with_effects.sql",
  "utf8"
);
const route = readFileSync("src/app/api/operacao/vendas/route.ts", "utf8");
const page = readFileSync("src/app/(dashboard)/operacao/vendas/page.tsx", "utf8");
const button = readFileSync("src/components/sales/delete-sale-button.tsx", "utf8");

test("exclusao da venda e atomica, isolada por tenant e exige permissao", () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /app_current_company_id\(\)/);
  assert.match(migration, /app_has_permission\('financeiro\.entradas', 'excluir'\)/);
  assert.match(migration, /where id = target_sale_id[\s\S]*company_id = current_company_id/);
  assert.match(migration, /grant execute on function public\.delete_sale_with_effects\(uuid\) to authenticated/);
});

test("exclusao reverte estoque, financeiro e comissao e registra auditoria", () => {
  assert.match(migration, /current_stock = product\.current_stock \+ sold\.quantity/);
  assert.match(migration, /delete from public\.stock_movements/);
  assert.match(migration, /delete from public\.commissions/);
  assert.match(migration, /delete from public\.financial_entries/);
  assert.match(migration, /insert into public\.audit_logs/);
});

test("exclusao preserva vendas com efeitos fiscais, bancarios ou comissao paga", () => {
  assert.match(migration, /return 'delete_nfse'/);
  assert.match(migration, /return 'delete_charge'/);
  assert.match(migration, /return 'delete_reconciliation'/);
  assert.match(migration, /return 'delete_commission_paid'/);
});

test("tela oferece exclusao no menu com confirmacao explicita", () => {
  assert.match(route, /delete_sale_with_effects/);
  assert.match(page, /<RowActionsMenu/);
  assert.match(page, /<DeleteSaleButton/);
  assert.match(button, /window\.confirm/);
  assert.match(button, /name="action" value="delete"/);
  assert.match(button, /produtos retornarao ao estoque/);
});
