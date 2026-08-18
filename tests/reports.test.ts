import assert from "node:assert/strict";
import test from "node:test";
import { reportToCsv } from "../src/lib/reports/csv.ts";
import { parseReportFilters } from "../src/lib/reports/types.ts";

test("usa o mes completo como periodo padrao dos relatorios", () => {
  const filters = parseReportFilters({});
  const [year, month] = filters.from.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();

  assert.equal(filters.from, `${year}-${String(month).padStart(2, "0")}-01`);
  assert.equal(filters.to, `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`);
});

test("exporta relatorio em CSV compativel com Excel", () => {
  const csv = reportToCsv({
    title: "Vendas",
    description: "Teste",
    dateFieldLabel: "Data",
    metrics: [],
    columns: [
      { key: "client", label: "Cliente" },
      { key: "amount", label: "Valor" }
    ],
    rows: [{ client: 'Otica "Central"; Matriz', amount: "R$ 1.250,00" }]
  });

  assert.ok(csv.startsWith("\uFEFFsep=;\r\n"));
  assert.match(csv, /"Otica ""Central""; Matriz";R\$ 1\.250,00/);
});
