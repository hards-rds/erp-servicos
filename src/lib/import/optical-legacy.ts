import { createHash } from "node:crypto";
import ExcelJS from "exceljs";

type SourceRecord = {
  sourceRow: number;
  values: Record<string, string>;
};

export type OpticalImportPlan = {
  clients: SourceRecord[];
  prescriptions: SourceRecord[];
  clientsByDocument: Map<string, SourceRecord>;
  clientsByName: Map<string, SourceRecord[]>;
  summary: {
    clientRows: number;
    clientsWithDocument: number;
    clientsWithoutDocument: number;
    prescriptionRows: number;
    prescriptionsWithDocument: number;
    prescriptionsMatchedByDocument: number;
    prescriptionsMatchedByUniqueName: number;
    prescriptionsForReview: number;
    invalidPrescriptionDates: number;
  };
};

const CLIENT_NAME = "Nome / Razao Social";
const PRESCRIPTION_NAME = "Nome / Razao Social";

function normalizedHeader(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function cellText(value: ExcelJS.CellValue) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
    if ("result" in value && value.result !== undefined) return String(value.result ?? "");
  }
  return String(value).trim();
}

async function workbookRecords(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("A planilha nao possui nenhuma aba.");

  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    headers[column - 1] = normalizedHeader(cellText(cell.value));
  });

  const records: SourceRecord[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Record<string, string> = {};
    for (let column = 1; column <= headers.length; column += 1) {
      const header = headers[column - 1];
      if (!header) continue;
      values[header] = cellText(row.getCell(column).value);
    }
    records.push({ sourceRow: rowNumber, values });
  });
  return records;
}

export function onlyDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

export function normalizePersonName(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

export function sourceFingerprint(parts: unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 24);
}

export function parseSpreadsheetDate(value: string) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(number) * 86400000).toISOString().slice(0, 10);
}

export async function buildOpticalImportPlan(clientsBuffer: Buffer, prescriptionsBuffer: Buffer): Promise<OpticalImportPlan> {
  const [rawClients, rawPrescriptions] = await Promise.all([
    workbookRecords(clientsBuffer),
    workbookRecords(prescriptionsBuffer),
  ]);
  const clients = rawClients.filter((row) => normalizePersonName(row.values[CLIENT_NAME]));
  const prescriptions = rawPrescriptions.filter((row) => normalizePersonName(row.values[PRESCRIPTION_NAME]));
  const clientsByDocument = new Map<string, SourceRecord>();
  const clientsByName = new Map<string, SourceRecord[]>();

  for (const client of clients) {
    const document = onlyDigits(client.values.Documento);
    if (document) clientsByDocument.set(document, client);
    const name = normalizePersonName(client.values[CLIENT_NAME]);
    clientsByName.set(name, [...(clientsByName.get(name) || []), client]);
  }

  let matchedByDocument = 0;
  let matchedByUniqueName = 0;
  let forReview = 0;
  let invalidDates = 0;
  for (const prescription of prescriptions) {
    const document = onlyDigits(prescription.values["CPF / CNPJ"]);
    const name = normalizePersonName(prescription.values[PRESCRIPTION_NAME]);
    if (document && clientsByDocument.has(document)) matchedByDocument += 1;
    else if ((clientsByName.get(name) || []).length === 1) matchedByUniqueName += 1;
    else forReview += 1;
    const date = parseSpreadsheetDate(prescription.values["Data de validade"]);
    if (!date || date > "2035-12-31") invalidDates += 1;
  }

  return {
    clients,
    prescriptions,
    clientsByDocument,
    clientsByName,
    summary: {
      clientRows: clients.length,
      clientsWithDocument: clients.filter((row) => onlyDigits(row.values.Documento)).length,
      clientsWithoutDocument: clients.filter((row) => !onlyDigits(row.values.Documento)).length,
      prescriptionRows: prescriptions.length,
      prescriptionsWithDocument: prescriptions.filter((row) => onlyDigits(row.values["CPF / CNPJ"])).length,
      prescriptionsMatchedByDocument: matchedByDocument,
      prescriptionsMatchedByUniqueName: matchedByUniqueName,
      prescriptionsForReview: forReview,
      invalidPrescriptionDates: invalidDates,
    },
  };
}

export function legacyClientDocument(client: SourceRecord) {
  const document = onlyDigits(client.values.Documento);
  if (document) return document;
  const externalId = client.values["Cliente ID"].replace(/\.0$/, "").trim();
  return `LEGADO-RAYSSA-${externalId || sourceFingerprint([client.sourceRow, client.values[CLIENT_NAME]])}`;
}

function firstValue(values: Record<string, string>, prefixes: string[]) {
  for (const prefix of prefixes) {
    for (let index = 0; index <= 30; index += 1) {
      const value = values[`${prefix}${index || ""}`]?.trim();
      if (value) return value.replace(/^'/, "");
    }
  }
  return null;
}

function clientNotes(client: SourceRecord) {
  const values = client.values;
  const details = [
    values["Observacao"] ? `Observacao original: ${values["Observacao"]}` : "",
    values["Data de Nascimento"] ? `Nascimento: ${parseSpreadsheetDate(values["Data de Nascimento"]) || values["Data de Nascimento"]}` : "",
    values.Sexo ? `Sexo: ${values.Sexo}` : "",
    values["Nome do Pai"] ? `Pai: ${values["Nome do Pai"]}` : "",
    values["Nome da Mae"] ? `Mae: ${values["Nome da Mae"]}` : "",
    values["Profissao"] ? `Profissao: ${values["Profissao"]}` : "",
    values["Convenio"] ? `Convenio: ${values["Convenio"]}` : "",
    values["Vendedor de Preferencia"] ? `Vendedor preferencial: ${values["Vendedor de Preferencia"]}` : "",
    `Importacao Rayssa Otica - cliente legado ${values["Cliente ID"].replace(/\.0$/, "")} - linha ${client.sourceRow}.`,
  ].filter(Boolean);
  return details.join("\n");
}

export function clientInsertPayload(client: SourceRecord, companyId: string, actorId: string) {
  const values = client.values;
  return {
    company_id: companyId,
    legal_name: values[CLIENT_NAME].trim(),
    trade_name: values["Apelido / Nome Fantasia"]?.trim() || null,
    document: legacyClientDocument(client),
    municipal_registration: values["Inscricao Municipal"]?.trim() || null,
    state_registration: (values["Inscricao Estadual"] || values["RG / IE"])?.trim() || null,
    fiscal_email: values.email?.trim() || null,
    financial_email: values.email?.trim() || null,
    phone: firstValue(values, ["celular", "telefone"]),
    address: {
      street: values["Endereco"]?.trim() || "",
      number: values["Numero"]?.trim() || "",
      complement: values.Complemento?.trim() || "",
      district: values.Bairro?.trim() || "",
      city: values.Cidade?.trim() || "",
      state: values.Estado?.trim().toUpperCase() || "",
      zipCode: onlyDigits(values.CEP),
    },
    status: values.Ativo?.toLowerCase() === "nao" ? "inativo" : "ativo",
    internal_notes: clientNotes(client),
    created_by: actorId,
    updated_by: actorId,
  };
}

function eye(values: Record<string, string>, side: "OD" | "OE", distance: "Longe" | "Perto") {
  return {
    sphere: values[`${side} ${distance} - Esferico`] || null,
    cylinder: values[`${side} ${distance} - Cilindrico`] || null,
    axis: values[`${side} ${distance} - Eixo`] || null,
    height: values[`${side} ${distance} - Altura`] || null,
    pd: values[`${side} ${distance} - Dnp`] || null,
  };
}

export function prescriptionSourceKey(prescription: SourceRecord) {
  return `rayssa-receitas:${sourceFingerprint([prescription.sourceRow, prescription.values])}`;
}

export function prescriptionInsertPayload(prescription: SourceRecord, companyId: string, clientId: string, actorId: string) {
  const values = prescription.values;
  const date = parseSpreadsheetDate(values["Data de validade"]);
  if (!date || date > "2035-12-31") return null;
  const rightDistance = eye(values, "OD", "Longe");
  const leftDistance = eye(values, "OE", "Longe");
  const rightNear = eye(values, "OD", "Perto");
  const leftNear = eye(values, "OE", "Perto");
  const rightPrimary = Object.values(rightDistance).some(Boolean) ? rightDistance : rightNear;
  const leftPrimary = Object.values(leftDistance).some(Boolean) ? leftDistance : leftNear;
  const sourceKey = prescriptionSourceKey(prescription);

  return {
    company_id: companyId,
    client_id: clientId,
    exam_date: date,
    professional_name: values["Medico optometrista"] || null,
    right_eye: {
      sphere: rightPrimary.sphere,
      cylinder: rightPrimary.cylinder,
      axis: rightPrimary.axis,
      addition: values["Adicao"] || null,
      pd: rightPrimary.pd,
    },
    left_eye: {
      sphere: leftPrimary.sphere,
      cylinder: leftPrimary.cylinder,
      axis: leftPrimary.axis,
      addition: values["Adicao"] || null,
      pd: leftPrimary.pd,
    },
    clinical_data: {
      import: { source: "rayssa-receitas", sourceKey, sourceRow: prescription.sourceRow, sourceDateLabel: "Data de validade" },
      distance: { right: rightDistance, left: leftDistance },
      near: { right: rightNear, left: leftNear },
      addition: values["Adicao"] || null,
      baseCurve: values["Curva base"] || null,
      leftEyeNotes: values["Olho esquerdo"] || null,
      rightEyeNotes: values["Olho direito"] || null,
      measurements: {
        rightHorizontal: values["OD - Horizontal"] || null,
        rightHorizontalAxis: values["OD - Eixo H"] || null,
        rightVertical: values["OD - Vertical"] || null,
        rightVerticalAxis: values["OD - Eixo V"] || null,
        leftHorizontal: values["OE - Horizontal"] || null,
        leftHorizontalAxis: values["OE - Eixo H"] || null,
        leftVertical: values["OE - Vertical"] || null,
        leftVerticalAxis: values["OE - Eixo V"] || null,
      },
    },
    notes: values["Observacao"] || null,
    created_by: actorId,
  };
}
