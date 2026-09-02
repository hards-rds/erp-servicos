import type { CteIbsCbsData } from "@/domains/fiscal/ibs-cbs";

export type CteFormValue = {
  id: string; environment: string; series: number; service_type: string; operation_nature: string;
  cfop: string; issue_state: string; freight_value: number | string; amount_receivable: number | string;
  components?: Array<{ name?: string; value?: number }> | null;
  tax_data?: { cst?: string; baseAmount?: number; rate?: number; amount?: number; ibsCbs?: Partial<CteIbsCbsData> } | null;
};

export function CteForm({ document }: { document: CteFormValue }) {
  const tax = document.tax_data || {};
  const ibsCbs = tax.ibsCbs || {};
  return <form className="form-stack" action="/api/fiscal/cte" method="post">
    <input type="hidden" name="action" value="update" /><input type="hidden" name="cteId" value={document.id} />
    <fieldset><legend>Identificacao fiscal</legend><div className="form-grid">
      <label>Ambiente<select name="environment" defaultValue={document.environment}><option value="homologacao">Homologacao</option><option value="producao">Producao</option></select></label>
      <label>Serie<input name="series" type="number" min="1" max="999" defaultValue={document.series} required /></label>
      <label>Tipo de servico<select name="serviceType" defaultValue={document.service_type}><option value="normal">Normal</option><option value="subcontratacao">Subcontratacao</option><option value="redespacho">Redespacho</option><option value="redespacho_intermediario">Redespacho intermediario</option><option value="multimodal">Multimodal</option></select></label>
      <label>UF de emissao<input name="issueState" defaultValue={document.issue_state} maxLength={2} required /></label>
    </div>
    <div className="form-grid"><label>Natureza da operacao<input name="operationNature" defaultValue={document.operation_nature} required /></label><label>CFOP<input name="cfop" defaultValue={document.cfop} inputMode="numeric" maxLength={4} placeholder="Ex.: 5353" required /></label></div></fieldset>
    <fieldset><legend>Valores</legend><div className="form-grid"><label>Valor do frete<input name="freightValue" inputMode="decimal" defaultValue={document.freight_value} required /></label><label>Valor a receber<input name="amountReceivable" inputMode="decimal" defaultValue={document.amount_receivable} required /></label></div></fieldset>
    <fieldset><legend>ICMS</legend><div className="form-grid">
      <label>CST<input name="taxCst" defaultValue={tax.cst || ""} placeholder="Ex.: 00, 40, 90" /></label><label>Base de calculo<input name="taxBaseAmount" inputMode="decimal" defaultValue={tax.baseAmount ?? ""} /></label><label>Aliquota (%)<input name="taxRate" inputMode="decimal" defaultValue={tax.rate ?? ""} /></label><label>Valor do ICMS<input name="taxAmount" inputMode="decimal" defaultValue={tax.amount ?? ""} /></label>
    </div></fieldset>
    <fieldset><legend>IBS e CBS</legend>
      <p className="muted">Valores da Reforma Tributaria calculados e preservados neste CT-e.</p>
      <div className="form-grid">
        <label>CST IBS/CBS<input name="ibsCbsCst" inputMode="numeric" pattern="[0-9]{3}" maxLength={3} defaultValue={ibsCbs.ibsCbsCst || ""} required /></label>
        <label>Classificacao tributaria<input name="ibsCbsTaxClass" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} defaultValue={ibsCbs.ibsCbsTaxClass || ""} required /></label>
        <label>Base de calculo<input name="ibsCbsBaseAmount" inputMode="decimal" defaultValue={ibsCbs.baseAmount ?? document.freight_value} required /></label>
      </div>
      <div className="form-grid">
        <label>IBS estadual (%)<input name="ibsStateRate" inputMode="decimal" defaultValue={ibsCbs.ibsStateRate ?? 0.1} required /></label>
        <label>Reducao IBS estadual (%)<input name="ibsStateReductionRate" inputMode="decimal" defaultValue={ibsCbs.ibsStateReductionRate ?? 0} /></label>
        <label>IBS municipal (%)<input name="ibsMunicipalRate" inputMode="decimal" defaultValue={ibsCbs.ibsMunicipalRate ?? 0} required /></label>
        <label>Reducao IBS municipal (%)<input name="ibsMunicipalReductionRate" inputMode="decimal" defaultValue={ibsCbs.ibsMunicipalReductionRate ?? 0} /></label>
        <label>CBS (%)<input name="cbsRate" inputMode="decimal" defaultValue={ibsCbs.cbsRate ?? 0.9} required /></label>
        <label>Reducao CBS (%)<input name="cbsReductionRate" inputMode="decimal" defaultValue={ibsCbs.cbsReductionRate ?? 0} /></label>
      </div>
      {ibsCbs.ibsAmount !== undefined || ibsCbs.cbsAmount !== undefined ? <p className="muted">Ultimo calculo salvo: IBS R$ {Number(ibsCbs.ibsAmount || 0).toFixed(2)} e CBS R$ {Number(ibsCbs.cbsAmount || 0).toFixed(2)}.</p> : null}
    </fieldset>
    <div className="row-actions"><button className="primary-button" type="submit">Salvar conferencia</button><button className="ghost-button" type="submit" name="action" value="validate">Validar CT-e</button></div>
  </form>;
}
