"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import type { StandardImportKind } from "@/lib/import/standard-import";

type ImportOption = {
  kind: StandardImportKind;
  label: string;
  description: string;
};

type ImportResult = {
  ok: boolean;
  error?: string;
  summary?: { rows: number; ready: number; duplicates: number; errors: number };
  errors?: Array<{ row: number; message: string }>;
  imported?: number;
};

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function StandardImportCenter({ options }: { options: ImportOption[] }) {
  const [kind, setKind] = useState<StandardImportKind>(options[0]?.kind || "clients");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState<"preview" | "import" | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const selected = useMemo(() => options.find((option) => option.kind === kind) || options[0], [kind, options]);

  function changeKind(nextKind: StandardImportKind) {
    setKind(nextKind);
    setFile(null);
    setResult(null);
    setConfirmed(false);
  }

  async function submit(action: "preview" | "import") {
    if (!file) return;
    setLoading(action);
    setResult(null);
    const body = new FormData();
    body.set("kind", kind);
    body.set("action", action);
    body.set("file", file);
    try {
      const response = await fetch("/api/configuracoes/importacoes", { method: "POST", body });
      const data = await response.json() as ImportResult;
      setResult(data);
    } catch {
      setResult({ ok: false, error: "Nao foi possivel enviar a planilha agora." });
    } finally {
      setLoading(null);
    }
  }

  function downloadErrors() {
    if (!result?.errors?.length) return;
    const rows = ["linha;erro", ...result.errors.map((error) => `${error.row};${csvCell(error.message)}`)];
    const url = URL.createObjectURL(new Blob([`\uFEFF${rows.join("\r\n")}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `erros-importacao-${kind}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!selected) return null;

  return (
    <div className="form-stack import-center">
      <div className="import-kind-picker" role="tablist" aria-label="Tipo de importacao">
        {options.map((option) => (
          <button
            className={option.kind === kind ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={option.kind === kind}
            key={option.kind}
            onClick={() => changeKind(option.kind)}
          >
            <FileSpreadsheet aria-hidden="true" />
            <span><strong>{option.label}</strong><small>{option.description}</small></span>
          </button>
        ))}
      </div>

      <section className="embedded-section import-workspace">
        <div className="table-panel-heading">
          <div><h2>{selected.label}</h2><p className="muted">{selected.description}</p></div>
          <a className="ghost-button button-link compact-button" href={`/api/configuracoes/importacoes?kind=${kind}`}>
            <Download aria-hidden="true" />Baixar modelo XLSX
          </a>
        </div>
        <label>
          Planilha preenchida
          <input
            type="file"
            accept=".xlsx"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setResult(null);
              setConfirmed(false);
            }}
          />
        </label>

        {result?.error ? <div className="form-error">{result.error}</div> : null}
        {result?.summary ? (
          <div className="summary-grid import-summary">
            <div><span>Linhas</span><strong>{result.summary.rows}</strong></div>
            <div><span>Prontas</span><strong>{result.summary.ready}</strong></div>
            <div><span>Duplicadas</span><strong>{result.summary.duplicates}</strong></div>
            <div><span>Com erro</span><strong>{result.summary.errors}</strong></div>
          </div>
        ) : null}
        {result?.imported !== undefined ? <div className="form-success">Importacao concluida: {result.imported} registro(s) adicionado(s).</div> : null}
        {result?.errors?.length ? (
          <div className="import-errors">
            <div className="table-panel-heading">
              <div><h3>Linhas para revisao</h3><p className="muted">Os demais registros podem ser importados normalmente.</p></div>
              <button className="ghost-button compact-button" type="button" onClick={downloadErrors}><Download aria-hidden="true" />Baixar erros</button>
            </div>
            <div className="table-wrap">
              <table><thead><tr><th>Linha</th><th>Erro</th></tr></thead><tbody>
                {result.errors.slice(0, 20).map((error) => <tr key={`${error.row}-${error.message}`}><td>{error.row}</td><td>{error.message}</td></tr>)}
              </tbody></table>
            </div>
          </div>
        ) : null}

        <label className="checkbox-row">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          Confirmo que revisei a analise e autorizo a gravacao dos registros validos.
        </label>
        <div className="page-form-actions">
          <button className="ghost-button" type="button" onClick={() => submit("preview")} disabled={!file || loading !== null}>
            {loading === "preview" ? "Analisando..." : "Analisar planilha"}
          </button>
          <button className="primary-button" type="button" onClick={() => submit("import")} disabled={!file || !result?.summary || !confirmed || loading !== null || result.summary.ready === 0}>
            <Upload aria-hidden="true" />{loading === "import" ? "Importando..." : "Importar registros validos"}
          </button>
        </div>
      </section>
    </div>
  );
}
