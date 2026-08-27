"use client";

import { useState } from "react";
import { Upload } from "lucide-react";

type ImportResult = {
  ok: boolean;
  error?: string;
  summary?: Record<string, number>;
  imported?: { clients: number; prescriptions: number; skippedExistingClients: number; skippedExistingPrescriptions: number; reviewRows: number };
};

export function OpticalImportForm({ companyId }: { companyId: string }) {
  const [clientsFile, setClientsFile] = useState<File | null>(null);
  const [prescriptionsFile, setPrescriptionsFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState<"preview" | "import" | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function submit(action: "preview" | "import") {
    if (!clientsFile || !prescriptionsFile) return;
    setLoading(action);
    setResult(null);
    const body = new FormData();
    body.set("action", action);
    body.set("companyId", companyId);
    body.set("clientsFile", clientsFile);
    body.set("prescriptionsFile", prescriptionsFile);
    const response = await fetch("/api/admin/importacao-optica", { method: "POST", body });
    const data = await response.json() as ImportResult;
    setResult(data);
    setLoading(null);
  }

  return (
    <div className="form-stack">
      <div className="form-grid">
        <label>Planilha de clientes<input type="file" accept=".xlsx" onChange={(event) => setClientsFile(event.target.files?.[0] || null)} /></label>
        <label>Planilha de receitas<input type="file" accept=".xlsx" onChange={(event) => setPrescriptionsFile(event.target.files?.[0] || null)} /></label>
      </div>
      <div className="muted">Os arquivos sao analisados antes da gravacao. Receitas com nomes homonimos ficam separadas para revisao.</div>
      {result?.error ? <div className="form-error">{result.error}</div> : null}
      {result?.summary ? (
        <div className="embedded-section">
          <h3>Resumo da analise</h3>
          <div className="summary-grid">
            {Object.entries(result.summary).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
        </div>
      ) : null}
      {result?.imported ? <div className="form-success">Importacao concluida: {result.imported.clients} clientes e {result.imported.prescriptions} receitas adicionados. {result.imported.reviewRows} receitas ficaram para revisao.</div> : null}
      <label className="checkbox-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Confirmo que os arquivos pertencem a esta empresa e autorizo a importacao.</label>
      <div className="page-form-actions">
        <button className="ghost-button" type="button" onClick={() => submit("preview")} disabled={!clientsFile || !prescriptionsFile || loading !== null}>{loading === "preview" ? "Analisando..." : "Analisar planilhas"}</button>
        <button className="primary-button" type="button" onClick={() => submit("import")} disabled={!clientsFile || !prescriptionsFile || !confirmed || loading !== null}><Upload aria-hidden="true" />{loading === "import" ? "Importando..." : "Importar dados"}</button>
      </div>
    </div>
  );
}
