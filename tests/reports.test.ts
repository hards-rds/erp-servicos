import assert from "node:assert/strict";
import test from "node:test";
import { reportToCsv } from "../src/lib/reports/csv.ts";

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
