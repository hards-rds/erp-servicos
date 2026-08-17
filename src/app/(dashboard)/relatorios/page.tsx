import { Download, Search } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ReportPrintButton } from "@/components/reports/report-print-button";
import { MetricCard } from "@/components/ui/metric-card";
import { getReportData } from "@/lib/reports/report-data";
import { parseReportFilters, REPORT_KEYS, reportLabels, reportStatuses } from "@/lib/reports/types";

type ReportsPageProps = {
  searchParams?: Promise<Record<string, string | undefined>>;
};

function reportLink(report: string, filters: Awaited<ReturnType<typeof parseReportFilters>>) {
  const params = new URLSearchParams({ report, from: filters.from, to: filters.to });
  if (filters.search) params.set("search", filters.search);
  return `/relatorios?${params.toString()}`;
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const filters = parseReportFilters(await searchParams || {});
  const report = await getReportData(filters);
  const exportParams = new URLSearchParams({
    report: filters.report,
    from: filters.from,
    to: filters.to
  });
  if (filters.status) exportParams.set("status", filters.status);
  if (filters.search) exportParams.set("search", filters.search);

  return (
    <>
      <PageHeader
        area="Gestao / Relatorios"
        title="Relatorios"
        description="Analise os dados da empresa ativa e exporte os resultados para Excel ou PDF."
        action={(
          <div className="page-actions report-export-actions">
            <ReportPrintButton />
            <a className="primary-button button-link button-with-icon" href={`/api/relatorios/exportar?${exportParams.toString()}`}>
              <Download aria-hidden="true" size={17} />
              Exportar CSV
            </a>
          </div>
        )}
      />

      <nav className="report-tabs" aria-label="Tipos de relatorio">
        {REPORT_KEYS.map((key) => (
          <Link className={filters.report === key ? "active" : ""} href={reportLink(key, filters)} key={key}>
            {reportLabels[key]}
          </Link>
        ))}
      </nav>

      <section className="form-panel report-filters">
        <form action="/relatorios" method="get">
          <input type="hidden" name="report" value={filters.report} />
          <label>
            De
            <input name="from" type="date" defaultValue={filters.from} disabled={filters.report === "estoque"} />
          </label>
          <label>
            Ate
            <input name="to" type="date" defaultValue={filters.to} disabled={filters.report === "estoque"} />
          </label>
          <label>
            Status
            <select name="status" defaultValue={filters.status}>
              <option value="">Todos</option>
              {reportStatuses[filters.report].map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </label>
          <label className="report-search-field">
            Buscar
            <input name="search" defaultValue={filters.search} placeholder="Cliente, descricao, documento..." />
          </label>
          <button className="primary-button button-with-icon" type="submit">
            <Search aria-hidden="true" size={17} />
            Aplicar filtros
          </button>
        </form>
        {filters.report === "estoque" ? <small className="muted">O relatorio de estoque apresenta a posicao atual dos produtos.</small> : null}
      </section>

      <section className="metrics report-metrics">
        {report.metrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} detail={metric.detail} />
        ))}
      </section>

      <section className="table-panel report-results">
        <div className="report-results-header">
          <div>
            <h2>{report.title}</h2>
            <p className="muted">{report.description}</p>
          </div>
          <span className="report-count">{report.rows.length.toLocaleString("pt-BR")} registros</span>
        </div>
        <div className="table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                {report.columns.map((column) => (
                  <th className={column.align === "right" ? "number-cell" : undefined} key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.length ? report.rows.map((row, index) => (
                <tr key={`${filters.report}-${index}`}>
                  {report.columns.map((column) => (
                    <td className={column.align === "right" ? "number-cell" : undefined} key={column.key}>
                      {column.key === "status" ? <span className="badge">{row[column.key]}</span> : row[column.key]}
                    </td>
                  ))}
                </tr>
              )) : (
                <tr>
                  <td colSpan={report.columns.length}>Nenhum registro encontrado para os filtros informados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
