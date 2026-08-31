import { Download, Search } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ReportAutoPrint, ReportPrintButton } from "@/components/reports/report-print-button";
import { MetricCard } from "@/components/ui/metric-card";
import { getReportData } from "@/lib/reports/report-data";
import { parseReportFilters, REPORT_KEYS, reportLabels, reportStatuses } from "@/lib/reports/types";
import { compareTableValuesInDirection } from "@/lib/table-sort";

type ReportsPageProps = {
  searchParams?: Promise<Record<string, string | undefined>>;
};

function reportLink(report: string, filters: Awaited<ReturnType<typeof parseReportFilters>>) {
  const params = new URLSearchParams({ report, from: filters.from, to: filters.to });
  if (filters.search) params.set("search", filters.search);
  return `/relatorios?${params.toString()}`;
}

function pageLink(filters: Awaited<ReturnType<typeof parseReportFilters>>, page: number, sort: string, direction: "asc" | "desc") {
  const params = new URLSearchParams({ report: filters.report, from: filters.from, to: filters.to, page: String(page) });
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  if (sort) params.set("sort", sort);
  if (direction === "desc") params.set("dir", direction);
  return `/relatorios?${params.toString()}`;
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const rawParams = await searchParams || {};
  const filters = parseReportFilters(rawParams);
  const report = await getReportData(filters);
  const sort = report.columns.some((column) => column.key === rawParams.sort) ? rawParams.sort || "" : "";
  const direction = rawParams.dir === "desc" ? "desc" : "asc";
  const sortedRows = sort
    ? [...report.rows].sort((left, right) => compareTableValuesInDirection(String(left[sort] ?? ""), String(right[sort] ?? ""), direction === "asc" ? "ascending" : "descending"))
    : report.rows;
  const printAll = rawParams.view === "print";
  const pageSize = 100;
  const requestedPage = Math.max(1, Number.parseInt(rawParams.page || "1", 10) || 1);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const firstRow = (currentPage - 1) * pageSize;
  const visibleRows = printAll ? sortedRows : sortedRows.slice(firstRow, firstRow + pageSize);
  const exportParams = new URLSearchParams({
    report: filters.report,
    from: filters.from,
    to: filters.to
  });
  if (filters.status) exportParams.set("status", filters.status);
  if (filters.search) exportParams.set("search", filters.search);
  if (sort) exportParams.set("sort", sort);
  if (direction === "desc") exportParams.set("dir", direction);
  const printParams = new URLSearchParams(exportParams);
  printParams.set("view", "print");

  return (
    <>
      {printAll ? <ReportAutoPrint /> : null}
      <PageHeader
        area="Gestao / Relatorios"
        title="Relatorios"
        description="Analise os dados da empresa ativa e exporte os resultados para Excel ou PDF."
        action={!printAll ? (
          <div className="page-actions report-export-actions">
            <ReportPrintButton href={`/relatorios?${printParams.toString()}`} />
            <a className="primary-button button-link button-with-icon" href={`/api/relatorios/exportar?${exportParams.toString()}`}>
              <Download aria-hidden="true" size={17} />
              Exportar CSV
            </a>
          </div>
        ) : undefined}
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
          {sort ? <input type="hidden" name="sort" value={sort} /> : null}
          {direction === "desc" ? <input type="hidden" name="dir" value={direction} /> : null}
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
          <span className="report-count">{sortedRows.length.toLocaleString("pt-BR")} registros</span>
        </div>
        <div className="table-wrap">
          <table className="report-table" data-server-sort="true" data-sort-key={`report-${filters.report}`} data-sort-column={sort} data-sort-direction={direction === "asc" ? "ascending" : "descending"}>
            <thead>
              <tr>
                {report.columns.map((column) => (
                  <th className={column.align === "right" ? "number-cell" : undefined} data-sort-key={column.key} key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length ? visibleRows.map((row, index) => (
                <tr key={`${filters.report}-${firstRow + index}`}>
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
        {!printAll && sortedRows.length > pageSize ? (
          <nav className="pagination report-pagination" aria-label="Paginacao do relatorio">
            <span className="pagination-summary">
              Exibindo {(firstRow + 1).toLocaleString("pt-BR")}-{Math.min(firstRow + pageSize, sortedRows.length).toLocaleString("pt-BR")} de {sortedRows.length.toLocaleString("pt-BR")}
            </span>
            <div className="pagination-actions">
              <Link className={`ghost-button button-link compact-button ${currentPage === 1 ? "disabled-control" : ""}`} href={pageLink(filters, currentPage - 1, sort, direction)} aria-disabled={currentPage === 1}>Anterior</Link>
              <span className="pagination-page">Pagina {currentPage} de {totalPages}</span>
              <Link className={`ghost-button button-link compact-button ${currentPage === totalPages ? "disabled-control" : ""}`} href={pageLink(filters, currentPage + 1, sort, direction)} aria-disabled={currentPage === totalPages}>Proxima</Link>
            </div>
          </nav>
        ) : null}
      </section>
    </>
  );
}
