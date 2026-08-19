import { existsSync } from "node:fs";
import path from "node:path";
import { DOMParser } from "@xmldom/xmldom";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

type XmlScope = Document | Element | null | undefined;

function directElement(scope: XmlScope, localName: string) {
  if (!scope?.childNodes) return null;
  for (let index = 0; index < scope.childNodes.length; index += 1) {
    const item = scope.childNodes[index] as Element;
    if (item?.nodeType === 1 && item.localName === localName) return item;
  }
  return null;
}

function element(scope: XmlScope, localName: string) {
  if (!scope?.getElementsByTagName) return null;
  const items = scope.getElementsByTagName("*");
  for (let index = 0; index < items.length; index += 1) {
    if (items[index]?.localName === localName) return items[index];
  }
  return null;
}

function xmlPath(scope: XmlScope, ...names: string[]) {
  let current: Element | null = scope as Element | null;
  for (const name of names) {
    current = directElement(current, name);
    if (!current) return null;
  }
  return current;
}

function value(scope: XmlScope, localName: string) {
  return directElement(scope, localName)?.textContent?.trim() || "";
}

function numberValue(scope: XmlScope, localName: string) {
  const raw = value(scope, localName).replace(",", ".");
  const parsed = Number(raw);
  return raw && Number.isFinite(parsed) ? parsed : null;
}

function digits(input: unknown) {
  return String(input ?? "").replace(/\D/g, "");
}

function text(input: unknown) {
  return String(input ?? "").replace(/\s+/g, " ").trim() || "-";
}

function money(input: unknown) {
  if (input === null || input === undefined || input === "") return "-";
  return Number(input).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function percent(input: unknown) {
  if (input === null || input === undefined || input === "") return "-";
  return `${Number(input).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`;
}

function dateBr(input: unknown, dateOnly = false) {
  const raw = String(input ?? "").trim();
  const literal = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?/);
  if (!literal) return text(raw);
  const [, year, month, day, hour, minute, second] = literal;
  return dateOnly || !hour ? `${day}/${month}/${year}` : `${day}/${month}/${year} ${hour}:${minute}:${second}`;
}

function documentNumber(input: unknown) {
  const raw = digits(input);
  if (raw.length === 14) return raw.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (raw.length === 11) return raw.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return text(input);
}

function cep(input: unknown) {
  const raw = digits(input);
  return raw.length === 8 ? raw.replace(/^(\d{2})(\d{3})(\d{3})$/, "$1.$2-$3") : text(input);
}

function serviceCode(input: unknown) {
  const raw = digits(input);
  return raw.length === 6 ? raw.replace(/^(\d{2})(\d{2})(\d{2})$/, "$1.$2.$3") : text(input);
}

function nbs(input: unknown) {
  const raw = digits(input);
  return raw.length === 9 ? raw.replace(/^(\d)(\d{4})(\d{2})(\d{2})$/, "$1.$2.$3.$4") : text(input);
}

function address(scope: XmlScope) {
  const root = directElement(scope, "enderNac") || directElement(scope, "end") || scope;
  const national = directElement(root, "endNac") || root;
  const parts = [value(root, "xLgr"), value(root, "nro"), value(root, "xCpl"), value(root, "xBairro")].filter(Boolean);
  return {
    line: parts.join(", ") || "-",
    cityCode: value(national, "cMun") || value(root, "cMun"),
    city: value(root, "xMun"),
    uf: value(national, "UF") || value(root, "UF"),
    cep: value(national, "CEP") || value(root, "CEP")
  };
}

function person(scope: XmlScope) {
  const location = address(scope);
  return {
    document: value(scope, "CNPJ") || value(scope, "CPF") || value(scope, "NIF"),
    name: value(scope, "xNome"),
    municipalRegistration: value(scope, "IM"),
    phone: value(scope, "fone"),
    email: value(scope, "email"),
    ...location
  };
}

function parseOfficialXml(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const nfse = element(document, "NFSe");
  const info = element(nfse || document, "infNFSe");
  if (!nfse || !info) throw new Error("O retorno nao contem uma NFS-e autorizada valida.");

  const dps = directElement(info, "DPS") || element(info, "DPS");
  const dpsInfo = directElement(dps, "infDPS") || element(dps, "infDPS") || dps;
  const issuer = directElement(info, "emit");
  const provider = directElement(dpsInfo, "prest");
  const customer = directElement(dpsInfo, "toma");
  const service = directElement(dpsInfo, "serv");
  const serviceInfo = xmlPath(service, "cServ");
  const serviceLocation = xmlPath(service, "locPrest");
  const dpsValues = directElement(dpsInfo, "valores");
  const serviceValues = xmlPath(dpsValues, "vServPrest");
  const taxes = xmlPath(dpsValues, "trib");
  const municipalTaxes = xmlPath(taxes, "tribMun");
  const totalTaxes = xmlPath(taxes, "totTrib", "pTotTrib");
  const officialValues = directElement(info, "valores");
  const regime = xmlPath(provider, "regTrib");
  const issuerAddress = address(issuer);
  const providerData = { ...person(issuer), phone: value(provider, "fone"), email: value(provider, "email") };
  const accessKey = digits(info.getAttribute("Id")).slice(-50);

  return {
    environment: value(dpsInfo, "tpAmb"),
    generator: value(info, "ambGer"),
    number: value(info, "nNFSe"),
    accessKey,
    issuedAt: value(info, "dhProc") || value(info, "dhEmi"),
    competence: value(dpsInfo, "dCompet"),
    dpsNumber: value(dpsInfo, "nDPS"),
    dpsSeries: value(dpsInfo, "serie"),
    dpsIssuedAt: value(dpsInfo, "dhEmi"),
    status: value(info, "cStat"),
    issuerType: value(dpsInfo, "tpEmit"),
    city: value(info, "xLocEmi") || issuerAddress.city,
    provider: providerData,
    customer: person(customer),
    service: {
      code: value(serviceInfo, "cTribNac"),
      municipalCode: value(serviceInfo, "cTribMun"),
      nbs: value(serviceInfo, "cNBS"),
      description: value(serviceInfo, "xDescServ"),
      taxDescription: value(info, "xTribNac"),
      city: value(info, "xLocPrestacao"),
      cityCode: value(serviceLocation, "cLocPrestacao")
    },
    simpleNational: value(regime, "opSimpNac"),
    simpleRegime: value(regime, "regApTribSN"),
    amount: numberValue(serviceValues, "vServ"),
    netAmount: numberValue(officialValues, "vLiq"),
    taxBase: numberValue(officialValues, "vBC"),
    issRate: numberValue(officialValues, "pAliqAplic"),
    issAmount: numberValue(officialValues, "vISSQN"),
    issType: value(municipalTaxes, "tribISSQN"),
    issRetention: value(municipalTaxes, "tpRetISSQN"),
    federalTax: numberValue(totalTaxes, "pTotTribFed"),
    stateTax: numberValue(totalTaxes, "pTotTribEst"),
    municipalTax: numberValue(totalTaxes, "pTotTribMun"),
    complements: value(info, "xOutInf")
  };
}

const simpleNationalLabels: Record<string, string> = {
  "1": "Nao optante",
  "2": "Optante - MEI",
  "3": "Optante - ME/EPP"
};

const issLabels: Record<string, string> = {
  "1": "Operacao tributavel",
  "2": "Imunidade",
  "3": "Exportacao de servico",
  "4": "Nao incidencia"
};

const retentionLabels: Record<string, string> = {
  "1": "Nao retido",
  "2": "Retido pelo tomador",
  "3": "Retido pelo intermediario"
};

export async function buildGovernmentDanfsePdf(xml: string) {
  const data = parseOfficialXml(xml);
  if (!data.number || data.accessKey.length !== 50 || data.amount === null) {
    throw new Error("O XML autorizado esta incompleto para gerar o DANFSe oficial.");
  }

  const pdf = new PDFDocument({ size: [595, 842], margin: 0, bufferPages: true });
  const chunks: Buffer[] = [];
  pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
  });

  const left = 9;
  const right = 586;
  const width = right - left;
  const col = width / 4;
  const xs = [left, left + col, left + col * 2, left + col * 3];
  const line = (y: number) => pdf.moveTo(left, y).lineTo(right, y).lineWidth(0.6).strokeColor("#111111").stroke();
  const shade = (x: number, y: number, w: number, h: number) => pdf.rect(x, y, w, h).fill("#eeeeee");
  const drawText = (content: unknown, x: number, y: number, w: number, options: { bold?: boolean; size?: number; height?: number; align?: "left" | "center" | "right" } = {}) => {
    pdf.font(options.bold ? "Helvetica-Bold" : "Helvetica").fontSize(options.size || 6.6).fillColor("#111111")
      .text(text(content), x, y, { width: w, height: options.height, align: options.align || "left", lineGap: 0.4, ellipsis: true });
  };
  const field = (label: string, content: unknown, column: number, y: number, w = col, options: { valueSize?: number; height?: number } = {}) => {
    drawText(label, xs[column] + 4, y + 2, w - 8, { bold: true, size: 5.7, height: 8 });
    drawText(content, xs[column] + 4, y + 10, w - 8, { size: options.valueSize || 6.7, height: options.height || 10 });
  };
  const section = (label: string, y: number) => {
    shade(left, y, col, 19);
    drawText(label, left + 4, y + 5, col - 8, { bold: true, size: 6.4, height: 9 });
  };

  pdf.rect(5, 5, 585, 832).lineWidth(1).stroke("#111111");
  shade(6, 6, 583, 34);
  const logoPath = path.join(process.cwd(), "public", "assets", "nfse-logo.png");
  if (existsSync(logoPath)) pdf.image(logoPath, 12, 11, { width: 116, height: 23 });
  drawText("DANFSe v2.0", 215, 12, 165, { bold: true, size: 9, align: "center" });
  drawText("Documento Auxiliar da NFS-e", 205, 24, 185, { bold: true, size: 8.5, align: "center" });
  drawText(`Municipio: ${text(data.city)}`, 444, 12, 139, { size: 6.6 });
  drawText(`Ambiente Gerador: ${text(data.generator)}`, 444, 21, 139, { size: 5.6 });
  drawText(`Tipo de Ambiente: ${text(data.environment)}`, 444, 29, 139, { size: 5.6 });
  line(40);

  field("CHAVE DE ACESSO DA NFS-e", data.accessKey, 0, 44, col * 3, { valueSize: 6.5 });
  const qrUrl = `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${encodeURIComponent(data.accessKey)}`;
  const qr = await QRCode.toBuffer(qrUrl, { errorCorrectionLevel: "M", margin: 0, width: 200 });
  pdf.image(qr, 493, 45, { width: 45, height: 45 });
  field("NUMERO DA NFS-e", data.number, 0, 65);
  field("COMPETENCIA DA NFS-e", dateBr(data.competence, true), 1, 65);
  field("DATA E HORA DA EMISSAO", dateBr(data.issuedAt), 2, 65);
  field("NUMERO DA DPS", data.dpsNumber, 0, 85);
  field("SERIE DA DPS", data.dpsSeries, 1, 85);
  field("EMISSAO DA DPS", dateBr(data.dpsIssuedAt), 2, 85);
  shade(left, 101, col, 24);
  field("EMITENTE DA NFS-e", data.issuerType === "1" ? "Prestador" : data.issuerType, 0, 104);
  field("SITUACAO DA NFS-e", data.status === "100" ? "NFS-e gerada" : data.status, 1, 104);
  drawText("A autenticidade desta NFS-e pode ser verificada pelo QR Code ou pela chave no portal nacional.", 447, 94, 135, { size: 5.5, height: 28, align: "center" });
  line(126);

  section("PRESTADOR / FORNECEDOR", 126);
  field("CNPJ / CPF / NIF", documentNumber(data.provider.document), 1, 126);
  field("Inscricao Municipal", data.provider.municipalRegistration, 2, 126);
  field("Telefone", data.provider.phone, 3, 126);
  field("Nome / Nome Empresarial", data.provider.name, 0, 145, col * 2);
  field("Municipio / UF", `${text(data.provider.city)} / ${text(data.provider.uf)}`, 2, 145);
  field("Codigo IBGE / CEP", `${text(data.provider.cityCode)} / ${cep(data.provider.cep)}`, 3, 145);
  field("Endereco", data.provider.line, 0, 164, col * 3);
  field("E-mail", data.provider.email, 3, 164);
  field("Simples Nacional", simpleNationalLabels[data.simpleNational] || data.simpleNational, 0, 183);
  field("Regime de apuracao pelo SN", data.simpleRegime, 1, 183, col * 3);
  line(203);

  section("TOMADOR / ADQUIRENTE", 203);
  field("CNPJ / CPF / NIF", documentNumber(data.customer.document), 1, 203);
  field("Inscricao Municipal", data.customer.municipalRegistration, 2, 203);
  field("Telefone", data.customer.phone, 3, 203);
  field("Nome / Nome Empresarial", data.customer.name, 0, 222, col * 2);
  field("Municipio / UF", `${text(data.customer.city)} / ${text(data.customer.uf)}`, 2, 222);
  field("Codigo IBGE / CEP", `${text(data.customer.cityCode)} / ${cep(data.customer.cep)}`, 3, 222);
  field("Endereco", data.customer.line, 0, 241, col * 3);
  field("E-mail", data.customer.email, 3, 241);
  line(261);
  drawText("INTERMEDIARIO DA OPERACAO NAO IDENTIFICADO NA NFS-e", left + 3, 267, width - 6, { size: 6.4, align: "center" });
  line(279);

  section("SERVICO PRESTADO", 279);
  field("Codigo Tributacao Nacional / Municipal", `${serviceCode(data.service.code)} / ${text(data.service.municipalCode)}`, 1, 279);
  field("Codigo da NBS", nbs(data.service.nbs), 2, 279);
  field("Local da prestacao / Codigo IBGE", `${text(data.service.city)} / ${text(data.service.cityCode)}`, 3, 279);
  drawText(data.service.taxDescription, left + 4, 300, width - 8, { size: 6.2, height: 10 });
  drawText("Descricao do servico", left + 4, 314, width - 8, { bold: true, size: 5.8 });
  drawText(data.service.description, left + 4, 323, width - 8, { size: 6.5, height: 55 });
  line(381);

  section("TRIBUTACAO MUNICIPAL (ISSQN)", 381);
  field("Tipo de tributacao", issLabels[data.issType] || data.issType, 1, 381);
  field("Base de calculo", money(data.taxBase), 0, 401);
  field("Aliquota aplicada", percent(data.issRate), 1, 401);
  field("Retencao do ISSQN", retentionLabels[data.issRetention] || data.issRetention, 2, 401);
  field("ISSQN apurado", money(data.issAmount), 3, 401);
  line(421);

  section("VALOR TOTAL DA NFS-e", 421);
  field("VALOR DA OPERACAO / SERVICO", money(data.amount), 1, 421);
  field("VALOR LIQUIDO DA NFS-e", money(data.netAmount ?? data.amount), 2, 421, col * 2);
  line(442);

  section("TRIBUTOS APROXIMADOS - LEI 12.741/2012", 442);
  field("Federais", percent(data.federalTax), 1, 442);
  field("Estaduais", percent(data.stateTax), 2, 442);
  field("Municipais", percent(data.municipalTax), 3, 442);
  line(463);

  drawText("INFORMACOES COMPLEMENTARES", left + 4, 468, width - 8, { bold: true, size: 6.4 });
  drawText(data.complements, left + 4, 482, width - 8, { size: 6.4, height: 290 });
  pdf.rect(left, 796, width, 20).lineWidth(0.6).stroke("#111111");
  field("NFS-e / CHAVE DE ACESSO", `${data.number} / ${data.accessKey}`, 0, 797, col * 4, { valueSize: 6.2 });

  pdf.end();
  return finished;
}

