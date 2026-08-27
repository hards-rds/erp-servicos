import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import {
  buildOpticalImportPlan,
  legacyClientDocument,
  normalizePersonName,
  parseSpreadsheetDate,
  prescriptionInsertPayload,
} from "../src/lib/import/optical-legacy.ts";

async function workbookBuffer(rows: unknown[][]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Dados");
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test("normaliza nomes e datas das planilhas legadas", () => {
  assert.equal(normalizePersonName("  João D'Ávila  "), "joao d avila");
  assert.equal(parseSpreadsheetDate("37622"), "2003-01-01");
  assert.equal(parseSpreadsheetDate("2026-08-26T00:00:00.000Z"), "2026-08-26");
});

test("planeja clientes e receitas sem misturar nomes homonimos", async () => {
  const clients = await workbookBuffer([
    ["Documento", "Nome / Razão Social", "Cliente ID"],
    ["11144477735", "Maria Silva", "10"],
    ["", "João Souza", "11"],
    ["", "João Souza", "12"],
  ]);
  const prescriptions = await workbookBuffer([
    ["CPF / CNPJ", "Nome / Razão Social", "Data de validade", "OD Longe - Esférico", "Observação"],
    ["11144477735", "Maria Silva", "37622", "-1.00", "Teste"],
    ["", "João Souza", "37622", "-2.00", "Revisar"],
  ]);

  const plan = await buildOpticalImportPlan(clients, prescriptions);
  assert.equal(plan.summary.clientRows, 3);
  assert.equal(plan.summary.prescriptionsMatchedByDocument, 1);
  assert.equal(plan.summary.prescriptionsForReview, 1);
  assert.equal(legacyClientDocument(plan.clients[1]), "LEGADO-RAYSSA-11");

  const payload = prescriptionInsertPayload(plan.prescriptions[0], "company", "client", "actor");
  assert.equal(payload?.right_eye.sphere, "-1.00");
  assert.equal(payload?.notes, "Teste");
});
