export type FiscalDocumentKind = "nfse" | "cte";

export type IbsCbsServiceData = {
  ibsCbsCst: string;
  ibsCbsTaxClass: string;
  ibsCbsOperationIndicator: string;
  ibsCbsPresumedCreditCode: string;
  ibsCbsFinalConsumer: boolean;
};

export type CteIbsCbsData = IbsCbsServiceData & {
  baseAmount: number;
  ibsStateRate: number;
  ibsStateReductionRate: number;
  ibsStateAmount: number;
  ibsMunicipalRate: number;
  ibsMunicipalReductionRate: number;
  ibsMunicipalAmount: number;
  ibsAmount: number;
  cbsRate: number;
  cbsReductionRate: number;
  cbsAmount: number;
};

type Row = Record<string, unknown>;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function digits(value: unknown) {
  return clean(value).replace(/\D/g, "");
}

function number(value: unknown, fallback = 0) {
  const raw = clean(value).replace(",", ".");
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeIbsCbsServiceData(data: Row | null | undefined): IbsCbsServiceData {
  return {
    ibsCbsCst: digits(data?.ibsCbsCst).slice(0, 3),
    ibsCbsTaxClass: digits(data?.ibsCbsTaxClass).slice(0, 6),
    ibsCbsOperationIndicator: digits(data?.ibsCbsOperationIndicator).slice(0, 6),
    ibsCbsPresumedCreditCode: digits(data?.ibsCbsPresumedCreditCode).slice(0, 2),
    ibsCbsFinalConsumer: data?.ibsCbsFinalConsumer === true
  };
}

export function collectIbsCbsServiceData(formData: FormData): IbsCbsServiceData {
  return {
    ibsCbsCst: clean(formData.get("ibsCbsCst")),
    ibsCbsTaxClass: clean(formData.get("ibsCbsTaxClass")),
    ibsCbsOperationIndicator: clean(formData.get("ibsCbsOperationIndicator")),
    ibsCbsPresumedCreditCode: clean(formData.get("ibsCbsPresumedCreditCode")),
    ibsCbsFinalConsumer: formData.get("ibsCbsFinalConsumer") === "on"
  };
}

export function hasIbsCbsServiceData(data: Row | null | undefined) {
  const normalized = normalizeIbsCbsServiceData(data);
  return Boolean(normalized.ibsCbsCst || normalized.ibsCbsTaxClass || normalized.ibsCbsOperationIndicator || normalized.ibsCbsPresumedCreditCode);
}

export function validateIbsCbsServiceData(data: Row | null | undefined, required = false) {
  const normalized = normalizeIbsCbsServiceData(data);
  const errors: string[] = [];
  if (!required && !hasIbsCbsServiceData(data)) return errors;
  if (!/^\d{3}$/.test(normalized.ibsCbsCst)) errors.push("CST IBS/CBS deve conter 3 digitos.");
  if (!/^\d{6}$/.test(normalized.ibsCbsTaxClass)) errors.push("Classificacao tributaria IBS/CBS deve conter 6 digitos.");
  if (!/^\d{6}$/.test(normalized.ibsCbsOperationIndicator)) errors.push("Indicador da operacao IBS/CBS deve conter 6 digitos.");
  if (normalized.ibsCbsPresumedCreditCode && !/^\d{2}$/.test(normalized.ibsCbsPresumedCreditCode)) errors.push("Codigo de credito presumido deve conter 2 digitos.");
  return errors;
}

export function inferTaxRegimeCode(settings: Row | null | undefined) {
  const configured = digits(settings?.taxRegimeCode);
  if (["1", "2", "3", "4"].includes(configured)) return configured;
  const simpleStatus = clean(settings?.simpleNationalStatus);
  if (simpleStatus === "1") return "3";
  if (simpleStatus === "2") return "4";
  if (simpleStatus === "3") return "1";
  return "";
}

export function isIbsCbsRequired(input: {
  documentKind: FiscalDocumentKind;
  environment: string;
  taxRegimeCode: string;
  issueDate?: string | Date;
}) {
  if (!input.environment.toLowerCase().startsWith("prod")) return true;
  const issueDate = input.issueDate instanceof Date
    ? input.issueDate.toISOString().slice(0, 10)
    : clean(input.issueDate) || new Date().toISOString().slice(0, 10);
  const simpleOrMei = ["1", "2", "4"].includes(input.taxRegimeCode);
  if (simpleOrMei) return issueDate >= "2027-01-01";
  return issueDate >= (input.documentKind === "cte" ? "2026-08-03" : "2026-10-01");
}

export function buildNfseIbsCbsXml(data: Row | null | undefined, escape: (value: unknown) => string) {
  const normalized = normalizeIbsCbsServiceData(data);
  if (validateIbsCbsServiceData(data, true).length) return "";
  return `    <IBSCBS>
      <finNFSe>0</finNFSe>
      <indFinal>${normalized.ibsCbsFinalConsumer ? "1" : "0"}</indFinal>
      <cIndOp>${escape(normalized.ibsCbsOperationIndicator)}</cIndOp>
      <valores>
        <trib>
          <gIBSCBS>
            <CST>${escape(normalized.ibsCbsCst)}</CST>
            <cClassTrib>${escape(normalized.ibsCbsTaxClass)}</cClassTrib>
            ${normalized.ibsCbsPresumedCreditCode ? `<cCredPres>${escape(normalized.ibsCbsPresumedCreditCode)}</cCredPres>` : ""}
          </gIBSCBS>
        </trib>
      </valores>
    </IBSCBS>`;
}

export function calculateCteIbsCbs(data: Partial<CteIbsCbsData>): CteIbsCbsData {
  const baseAmount = Math.max(0, number(data.baseAmount));
  const ibsStateRate = Math.max(0, number(data.ibsStateRate, 0.1));
  const ibsStateReductionRate = Math.max(0, number(data.ibsStateReductionRate));
  const ibsMunicipalRate = Math.max(0, number(data.ibsMunicipalRate));
  const ibsMunicipalReductionRate = Math.max(0, number(data.ibsMunicipalReductionRate));
  const cbsRate = Math.max(0, number(data.cbsRate, 0.9));
  const cbsReductionRate = Math.max(0, number(data.cbsReductionRate));
  const ibsStateAmount = roundMoney(baseAmount * ibsStateRate * (1 - ibsStateReductionRate / 100) / 100);
  const ibsMunicipalAmount = roundMoney(baseAmount * ibsMunicipalRate * (1 - ibsMunicipalReductionRate / 100) / 100);
  const cbsAmount = roundMoney(baseAmount * cbsRate * (1 - cbsReductionRate / 100) / 100);
  return {
    ...normalizeIbsCbsServiceData(data as Row),
    baseAmount,
    ibsStateRate,
    ibsStateReductionRate,
    ibsStateAmount,
    ibsMunicipalRate,
    ibsMunicipalReductionRate,
    ibsMunicipalAmount,
    ibsAmount: roundMoney(ibsStateAmount + ibsMunicipalAmount),
    cbsRate,
    cbsReductionRate,
    cbsAmount
  };
}

export function validateCteIbsCbs(data: Partial<CteIbsCbsData> | null | undefined, required = false) {
  const record = (data || {}) as Row;
  const normalized = normalizeIbsCbsServiceData(record);
  const hasClassification = Boolean(normalized.ibsCbsCst || normalized.ibsCbsTaxClass);
  const errors: string[] = [];
  if (!required && !hasClassification) return errors;
  if (!/^\d{3}$/.test(normalized.ibsCbsCst)) errors.push("CST IBS/CBS deve conter 3 digitos.");
  if (!/^\d{6}$/.test(normalized.ibsCbsTaxClass)) errors.push("Classificacao tributaria IBS/CBS deve conter 6 digitos.");
  const calculated = calculateCteIbsCbs(data || {});
  if (calculated.baseAmount <= 0) errors.push("Base de calculo IBS/CBS deve ser maior que zero.");
  for (const [label, value] of [
    ["Aliquota IBS estadual", calculated.ibsStateRate],
    ["Reducao IBS estadual", calculated.ibsStateReductionRate],
    ["Aliquota IBS municipal", calculated.ibsMunicipalRate],
    ["Reducao IBS municipal", calculated.ibsMunicipalReductionRate],
    ["Aliquota CBS", calculated.cbsRate],
    ["Reducao CBS", calculated.cbsReductionRate]
  ] as Array<[string, number]>) {
    if (!Number.isFinite(value) || value < 0 || value > 100) errors.push(`${label} deve estar entre 0 e 100%.`);
  }
  return errors;
}
