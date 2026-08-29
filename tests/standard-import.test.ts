import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ExcelJS from "exceljs";
import {
  buildStandardImportPlan,
  readStandardImportRows,
  standardImportTemplate
} from "../src/lib/import/standard-import.ts";

test("importador de clientes valida documento e duplicidade dentro da planilha", () => {
  const plan = buildStandardImportPlan("clients", [
    { row: 2, values: { nome: "Cliente Um", cpf_cnpj: "529.982.247-25" } },
    { row: 3, values: { nome: "Cliente Repetido", cpf_cnpj: "52998224725" } },
    { row: 4, values: { nome: "Sem documento", cpf_cnpj: "123" } }
  ], "tecnologia");

  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].key, "52998224725");
  assert.equal(plan.errors.length, 2);
  assert.match(plan.errors[0].message, /duplicado/i);
  assert.match(plan.errors[1].message, /invalido/i);
});

test("catalogo respeita tipos do segmento e codigos fiscais", () => {
  const valid = buildStandardImportPlan("services", [{
    row: 2,
    values: {
      codigo: "SUP-01",
      nome: "Suporte mensal",
      tipo: "suporte",
      preco_de_venda: "1.250,50",
      codigo_nacional_do_servico: "010701",
      nbs: "123456789"
    }
  }], "tecnologia");
  const invalid = buildStandardImportPlan("services", [{
    row: 2,
    values: { codigo: "EX-01", nome: "Exame", tipo: "exame", preco_de_venda: "100" }
  }], "tecnologia");

  assert.equal(valid.items.length, 1);
  assert.equal(valid.items[0].payload.sale_price, 1250.5);
  assert.equal(invalid.items.length, 0);
  assert.match(invalid.errors[0].message, /segmento/i);
});

test("modelo XLSX oficial pode ser lido novamente pelo importador", async () => {
  const template = await standardImportTemplate("products");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  sheet.addRow(["ARM-001", "Armacao", "Armacao", "un", "50", "120", "4", "1", "", "Sim"]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const rows = await readStandardImportRows(buffer);
  const plan = buildStandardImportPlan("products", rows, "otica");

  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].key, "arm-001");
  assert.equal(plan.items[0].payload.current_stock, 4);
});

test("API exige permissao, limita empresa e preserva historico do estoque", () => {
  const source = readFileSync("src/app/api/configuracoes/importacoes/route.ts", "utf8");
  assert.match(source, /requireCompanyPermission/);
  assert.match(source, /\.eq\("company_id", companyId\)/);
  assert.match(source, /ignoreDuplicates: true/);
  assert.match(source, /import_products_with_initial_stock/);
  assert.match(source, /writeCompanyAudit/);

  const migration = readFileSync("supabase/migrations/20260829130000_standard_product_import.sql", "utf8");
  assert.match(migration, /app_has_permission\('operacao\.estoque', 'criar'\)/);
  assert.match(migration, /insert into public\.stock_movements/);
  assert.match(migration, /from inserted/);
});
