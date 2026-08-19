import { DOMParser } from "@xmldom/xmldom";
import { buildDanfsePdf } from "@/lib/pdf/simple-pdf";
import { createServiceClient } from "@/lib/supabase/server";
import { decodeNfseXml } from "@/lib/integrations/nfse-transport";
import { storePrivateFile } from "@/lib/files/app-files";

type Row = Record<string, unknown>;

function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function row(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function relation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function xmlText(document: Document, name: string) {
  return clean(document.getElementsByTagNameNS("*", name)[0]?.textContent);
}

function extractNfseInfo(payload: unknown) {
  const data = row(payload);
  const direct = {
    number: clean(data.numeroNfse || data.numero_nfse || data.numero || data.idNfse),
    accessKey: clean(data.chaveAcesso || data.chave_acesso || data.protocolo),
    verificationCode: clean(data.codigoVerificacao || data.codigo_verificacao),
    issuedAt: clean(data.dataEmissao || data.data_emissao || data.dhEmi)
  };

  if (typeof data.nfseXmlGZipB64 !== "string") return direct;

  try {
    const xml = decodeNfseXml(data.nfseXmlGZipB64);
    const doc = new DOMParser().parseFromString(xml);
    const infoElement = doc.getElementsByTagNameNS("*", "infNFSe")[0];
    const accessKeyFromId = onlyDigits(infoElement?.getAttribute("Id"));
    return {
      number: xmlText(doc, "nNFSe") || xmlText(doc, "numeroNfse") || direct.number,
      accessKey: xmlText(doc, "chNFSe") || (accessKeyFromId.length === 50 ? accessKeyFromId : direct.accessKey),
      verificationCode: xmlText(doc, "cVerif") || direct.verificationCode,
      issuedAt: xmlText(doc, "dhProc") || xmlText(doc, "dhEmi") || direct.issuedAt
    };
  } catch {
    return direct;
  }
}

export async function generateAndAttachDanfsePdf(documentId: string, actorId?: string | null) {
  const supabase = createServiceClient();
  const { data: document, error } = await supabase
    .from("nfse_documents")
    .select(`
      id,
      company_id,
      status,
      competence,
      service_amount,
      external_id,
      protocol,
      request_payload,
      response_payload,
      companies(name,document,fiscal_settings),
      clients(legal_name,document,fiscal_email),
      financial_entries(description,net_amount)
    `)
    .eq("id", documentId)
    .maybeSingle();

  if (error || !document) throw new Error("Documento fiscal nao encontrado.");
  if (!["autorizada", "cancelada"].includes(String(document.status))) {
    throw new Error("DANFSe disponivel somente para NFS-e autorizada ou cancelada.");
  }

  const company = relation(document.companies as unknown as { name: string; document: string | null; fiscal_settings: Row | null } | { name: string; document: string | null; fiscal_settings: Row | null }[] | null);
  const client = relation(document.clients as unknown as { legal_name: string; document: string; fiscal_email: string | null } | { legal_name: string; document: string; fiscal_email: string | null }[] | null);
  const entry = relation(document.financial_entries as unknown as { description: string; net_amount: number | string } | { description: string; net_amount: number | string }[] | null);
  if (!company || !client) throw new Error("Dados da nota incompletos para gerar o DANFSe.");

  const fiscalSettings = row(company.fiscal_settings);
  const requestPayload = row(document.request_payload);
  const nfseInfo = extractNfseInfo(document.response_payload);
  const number = nfseInfo.number || clean(document.external_id) || document.id.slice(0, 8);
  const pdf = buildDanfsePdf({
    companyName: company.name,
    companyDocument: onlyDigits(company.document),
    companyMunicipalRegistration: clean(fiscalSettings.municipalRegistration),
    clientName: client.legal_name,
    clientDocument: onlyDigits(client.document),
    clientEmail: client.fiscal_email,
    number,
    accessKey: nfseInfo.accessKey || clean(document.protocol),
    verificationCode: nfseInfo.verificationCode,
    competence: document.competence,
    issuedAt: nfseInfo.issuedAt,
    serviceDescription: entry?.description || clean(requestPayload.serviceDescription) || "Prestacao de servicos",
    serviceCode: clean(requestPayload.serviceCode),
    nbsCode: clean(requestPayload.nbsCode),
    cityCode: clean(requestPayload.cityCode),
    amount: entry?.net_amount || document.service_amount,
    protocol: document.protocol,
    status: String(document.status)
  });

  const safeNumber = number.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || document.id.slice(0, 8);
  const path = `${document.company_id}/nfse/${document.id}/danfse-${safeNumber}.pdf`;
  const fileId = await storePrivateFile({
    companyId: document.company_id,
    path,
    content: pdf,
    contentType: "application/pdf",
    createdBy: actorId || null
  });

  await supabase
    .from("nfse_documents")
    .update({ danfse_file_id: fileId, updated_at: new Date().toISOString() })
    .eq("id", document.id);

  return { fileId, content: pdf, fileName: `danfse-${safeNumber}.pdf` };
}
