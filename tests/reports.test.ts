import assert from "node:assert/strict";
import test from "node:test";
import { reportToCsv } from "../src/lib/reports/csv.ts";
import { fetchAllReportRows } from "../src/lib/reports/fetch-all.ts";
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

test("busca todas as paginas mesmo quando a API limita cada resposta", async () => {
  const source = Array.from({ length: 2505 }, (_, id) => ({ id }));
  const ranges: Array<[number, number]> = [];
  const rows = await fetchAllReportRows(async (from, to) => {
    ranges.push([from, to]);
    return { data: source.slice(from, to + 1), error: null };
  }, 1000);

  assert.equal(rows.length, 2505);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.equal(rows.at(-1)?.id, 2504);
});

test("interrompe a paginacao quando o Supabase retorna erro", async () => {
  const expected = new Error("consulta indisponivel");
  await assert.rejects(
    fetchAllReportRows(async () => ({ data: null, error: expected })),
    expected
  );
});
