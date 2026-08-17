import type { ReportResult } from "@/lib/reports/types";

function escapeCsv(value: string) {
  const safe = value.replace(/"/g, '""');
  return /[;"\r\n]/.test(safe) ? `"${safe}"` : safe;
}

export function reportToCsv(report: ReportResult) {
  const header = report.columns.map((column) => escapeCsv(column.label)).join(";");
  const rows = report.rows.map((row) => (
    report.columns.map((column) => escapeCsv(row[column.key] || "")).join(";")
  ));

  return `\uFEFFsep=;\r\n${[header, ...rows].join("\r\n")}\r\n`;
}
