import ExcelJS from "exceljs";
import { serviceTypeOptions, type ServiceSegment } from "../../domains/services/catalog.ts";
import { isValidCpfOrCnpj, onlyDigits } from "../validations/br-documents.ts";

export type StandardImportKind = "clients" | "services" | "products" | "school_classes";

export type ImportRowError = {
  row: number;
  message: string;
};

export type StandardImportItem = {
  row: number;
  key: string;
  payload: Record<string, unknown>;
};

export type StandardImportPlan = {
  totalRows: number;
  items: StandardImportItem[];
  errors: ImportRowError[];
};

export const standardImportDefinitions: Record<StandardImportKind, {
  label: string;
  description: string;
  segments: ServiceSegment[];
  columns: string[];
}> = {
  clients: {
    label: "Clientes",
    description: "Cadastro fiscal, contato e endereco",
    segments: ["tecnologia", "otica", "escola_futebol", "generico"],
    columns: [
      "Nome", "CPF/CNPJ", "Nome fantasia", "E-mail fiscal", "E-mail financeiro", "Telefone",
      "CEP", "Logradouro", "Numero", "Complemento", "Bairro", "Cidade", "UF", "Codigo IBGE",
      "Inscricao municipal", "Inscricao estadual", "Observacoes", "Status"
    ]
  },
  services: {
    label: "Servicos",
    description: "Catalogo, valores e codigos fiscais",
    segments: ["tecnologia", "otica", "generico"],
    columns: [
      "Codigo", "Nome", "Descricao", "Categoria", "Tipo", "Preco de venda", "Codigo nacional do servico",
      "Codigo municipal do servico", "NBS", "Reter ISS", "Observacoes", "Ativo"
    ]
  },
  products: {
    label: "Produtos e estoque",
    description: "Produtos, precos e saldo inicial",
    segments: ["tecnologia", "otica", "generico"],
    columns: [
      "SKU", "Nome", "Categoria", "Unidade", "Preco de custo", "Preco de venda", "Estoque atual",
      "Estoque minimo", "Observacoes", "Ativo"
    ]
  },
  school_classes: {
    label: "Turmas",
    description: "Categorias, horarios, capacidade e mensalidade",
    segments: ["escola_futebol"],
    columns: [
      "Nome", "Categoria", "Faixa etaria", "Professor", "Capacidade", "Dias", "Horario inicial",
      "Horario final", "Local", "Mensalidade", "Ativo"
    ]
  }
};

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function standardImportKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cellText(value: ExcelJS.CellValue) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("").trim();
    if ("result" in value && value.result !== undefined) return String(value.result ?? "").trim();
  }
  return String(value).trim();
}

export async function readStandardImportRows(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("A planilha nao possui nenhuma aba.");

  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    headers[column - 1] = normalizeHeader(cellText(cell.value));
  });

  const rows: Array<{ row: number; values: Record<string, string> }> = [];
  worksheet.eachRow({ includeEmpty: false }, (sourceRow, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Record<string, string> = {};
    let hasValue = false;
    for (let column = 1; column <= headers.length; column += 1) {
      const header = headers[column - 1];
      if (!header) continue;
      const value = cellText(sourceRow.getCell(column).value);
      values[header] = value;
      if (value) hasValue = true;
    }
    if (hasValue) rows.push({ row: rowNumber, values });
  });
  return rows;
}

export async function standardImportTemplate(kind: StandardImportKind) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(standardImportDefinitions[kind].label);
  worksheet.addRow(standardImportDefinitions[kind].columns);
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).alignment = { vertical: "middle" };
  worksheet.columns.forEach((column) => { column.width = 22; });
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function value(values: Record<string, string>, key: string) {
  return values[normalizeHeader(key)]?.trim() || "";
}

function parseNumber(raw: string) {
  if (!raw) return 0;
  const compact = raw.replace(/\s/g, "");
  const normalized = compact.includes(",") ? compact.replace(/\./g, "").replace(",", ".") : compact;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(raw: string, fallback = true) {
  if (!raw) return fallback;
  return !["nao", "não", "false", "0", "inativo"].includes(raw.trim().toLowerCase());
}

function rowError(errors: ImportRowError[], row: number, messages: string[]) {
  if (messages.length) errors.push({ row, message: messages.join("; ") });
}

function planClient(row: number, values: Record<string, string>, errors: ImportRowError[]) {
  const name = value(values, "Nome");
  const document = onlyDigits(value(values, "CPF/CNPJ"));
  const messages: string[] = [];
  if (!name) messages.push("Nome obrigatorio");
  if (!isValidCpfOrCnpj(document)) messages.push("CPF/CNPJ invalido");
  rowError(errors, row, messages);
  if (messages.length) return null;
  return {
    row,
    key: document,
    payload: {
      legal_name: name,
      trade_name: value(values, "Nome fantasia") || null,
      document,
      fiscal_email: value(values, "E-mail fiscal") || null,
      financial_email: value(values, "E-mail financeiro") || null,
      phone: value(values, "Telefone") || null,
      municipal_registration: value(values, "Inscricao municipal") || null,
      state_registration: value(values, "Inscricao estadual") || null,
      address: {
        zipCode: onlyDigits(value(values, "CEP")),
        street: value(values, "Logradouro"),
        number: value(values, "Numero"),
        complement: value(values, "Complemento"),
        district: value(values, "Bairro"),
        city: value(values, "Cidade"),
        state: value(values, "UF").toUpperCase(),
        cityCode: onlyDigits(value(values, "Codigo IBGE"))
      },
      internal_notes: value(values, "Observacoes") || null,
      status: parseBoolean(value(values, "Status")) ? "ativo" : "inativo"
    }
  } satisfies StandardImportItem;
}

function planService(row: number, values: Record<string, string>, segment: ServiceSegment, errors: ImportRowError[]) {
  const code = value(values, "Codigo");
  const name = value(values, "Nome");
  const type = value(values, "Tipo").toLowerCase();
  const salePrice = parseNumber(value(values, "Preco de venda"));
  const serviceCode = onlyDigits(value(values, "Codigo nacional do servico"));
  const nbsCode = onlyDigits(value(values, "NBS"));
  const allowedTypes = new Set(serviceTypeOptions[segment].map((option) => option.value));
  const messages: string[] = [];
  if (!code) messages.push("Codigo obrigatorio");
  if (!name) messages.push("Nome obrigatorio");
  if (!allowedTypes.has(type)) messages.push("Tipo de servico invalido para o segmento");
  if (salePrice === null || salePrice < 0) messages.push("Preco de venda invalido");
  if (serviceCode && serviceCode.length !== 6) messages.push("Codigo nacional deve ter 6 digitos");
  if (nbsCode && nbsCode.length !== 9) messages.push("NBS deve ter 9 digitos");
  rowError(errors, row, messages);
  if (messages.length) return null;
  return {
    row,
    key: code.toLowerCase(),
    payload: {
      code,
      name,
      description: value(values, "Descricao") || null,
      category: value(values, "Categoria") || null,
      service_type: type,
      sale_price: salePrice,
      fiscal_service_data: {
        provider: "nfse_nacional",
        serviceCode,
        municipalServiceCode: value(values, "Codigo municipal do servico"),
        nbsCode,
        retainIss: parseBoolean(value(values, "Reter ISS"), false)
      },
      notes: value(values, "Observacoes") || null,
      active: parseBoolean(value(values, "Ativo"))
    }
  } satisfies StandardImportItem;
}

function planProduct(row: number, values: Record<string, string>, errors: ImportRowError[]) {
  const sku = value(values, "SKU");
  const name = value(values, "Nome");
  const costPrice = parseNumber(value(values, "Preco de custo"));
  const salePrice = parseNumber(value(values, "Preco de venda"));
  const currentStock = parseNumber(value(values, "Estoque atual"));
  const minStock = parseNumber(value(values, "Estoque minimo"));
  const messages: string[] = [];
  if (!sku) messages.push("SKU obrigatorio");
  if (!name) messages.push("Nome obrigatorio");
  if (costPrice === null || costPrice < 0) messages.push("Preco de custo invalido");
  if (salePrice === null || salePrice < 0) messages.push("Preco de venda invalido");
  if (currentStock === null || currentStock < 0) messages.push("Estoque atual invalido");
  if (minStock === null || minStock < 0) messages.push("Estoque minimo invalido");
  rowError(errors, row, messages);
  if (messages.length) return null;
  return {
    row,
    key: sku.toLowerCase(),
    payload: {
      sku,
      name,
      category: value(values, "Categoria") || null,
      unit: value(values, "Unidade") || "un",
      cost_price: costPrice,
      sale_price: salePrice,
      current_stock: currentStock,
      min_stock: minStock,
      notes: value(values, "Observacoes") || null,
      active: parseBoolean(value(values, "Ativo"))
    }
  } satisfies StandardImportItem;
}

function planSchoolClass(row: number, values: Record<string, string>, errors: ImportRowError[]) {
  const name = value(values, "Nome");
  const category = value(values, "Categoria");
  const capacityRaw = value(values, "Capacidade");
  const capacity = capacityRaw ? parseNumber(capacityRaw) : null;
  const monthlyFee = parseNumber(value(values, "Mensalidade"));
  const messages: string[] = [];
  if (!name) messages.push("Nome obrigatorio");
  if (!category) messages.push("Categoria obrigatoria");
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) messages.push("Capacidade invalida");
  if (monthlyFee === null || monthlyFee < 0) messages.push("Mensalidade invalida");
  rowError(errors, row, messages);
  if (messages.length) return null;
  return {
    row,
    key: standardImportKey(name),
    payload: {
      name,
      category,
      age_group: value(values, "Faixa etaria") || null,
      coach_name: value(values, "Professor") || null,
      capacity,
      schedule: {
        days: value(values, "Dias"),
        startTime: value(values, "Horario inicial"),
        endTime: value(values, "Horario final")
      },
      location: value(values, "Local") || null,
      default_monthly_fee: monthlyFee,
      active: parseBoolean(value(values, "Ativo"))
    }
  } satisfies StandardImportItem;
}

export function buildStandardImportPlan(
  kind: StandardImportKind,
  rows: Array<{ row: number; values: Record<string, string> }>,
  segment: ServiceSegment
): StandardImportPlan {
  const errors: ImportRowError[] = [];
  const items: StandardImportItem[] = [];
  const seen = new Set<string>();

  for (const source of rows) {
    const item = kind === "clients"
      ? planClient(source.row, source.values, errors)
      : kind === "services"
        ? planService(source.row, source.values, segment, errors)
        : kind === "products"
          ? planProduct(source.row, source.values, errors)
          : planSchoolClass(source.row, source.values, errors);
    if (!item) continue;
    if (seen.has(item.key)) {
      errors.push({ row: item.row, message: "Registro duplicado dentro da planilha" });
      continue;
    }
    seen.add(item.key);
    items.push(item);
  }

  return { totalRows: rows.length, items, errors };
}

export function isStandardImportKind(value: string): value is StandardImportKind {
  return value in standardImportDefinitions;
}
