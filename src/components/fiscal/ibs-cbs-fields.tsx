type FiscalData = Record<string, unknown> | null | undefined;

function value(data: FiscalData, key: string) {
  const current = data?.[key];
  return typeof current === "string" || typeof current === "number" ? String(current) : "";
}

export function IbsCbsServiceFields({ data }: { data?: FiscalData }) {
  return (
    <div className="form-stack">
      <p className="muted">Classificacao da Reforma Tributaria usada na DPS da NFS-e.</p>
      <div className="form-grid">
        <label>CST IBS/CBS<input name="ibsCbsCst" inputMode="numeric" pattern="[0-9]{3}" maxLength={3} placeholder="3 digitos" defaultValue={value(data, "ibsCbsCst")} /></label>
        <label>Classificacao tributaria<input name="ibsCbsTaxClass" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="6 digitos" defaultValue={value(data, "ibsCbsTaxClass")} /></label>
        <label>Indicador da operacao<input name="ibsCbsOperationIndicator" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="6 digitos" defaultValue={value(data, "ibsCbsOperationIndicator")} /></label>
        <label>Credito presumido<input name="ibsCbsPresumedCreditCode" inputMode="numeric" pattern="[0-9]{2}" maxLength={2} placeholder="Opcional" defaultValue={value(data, "ibsCbsPresumedCreditCode")} /></label>
      </div>
      <label className="checkbox-row"><input type="checkbox" name="ibsCbsFinalConsumer" defaultChecked={data?.ibsCbsFinalConsumer === true} /><span>Tomador e consumidor final</span></label>
    </div>
  );
}
