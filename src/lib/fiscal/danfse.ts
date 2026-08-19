import { buildGovernmentDanfsePdf } from "@/lib/pdf/government-danfse";
import { createServiceClient } from "@/lib/supabase/server";
import { storePrivateFile } from "@/lib/files/app-files";
import { findAuthorizedNfseXml } from "@/lib/fiscal/nfse-xml";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export async function generateAndAttachDanfsePdf(documentId: string, actorId?: string | null) {
  const supabase = createServiceClient();
  const { data: document, error } = await supabase
    .from("nfse_documents")
    .select(`
      id,
      company_id,
      status,
      external_id,
      response_payload
    `)
    .eq("id", documentId)
    .maybeSingle();

  if (error || !document) throw new Error("Documento fiscal nao encontrado.");
  if (!["autorizada", "cancelada"].includes(String(document.status))) {
    throw new Error("DANFSe disponivel somente para NFS-e autorizada ou cancelada.");
  }

  const authorizedXml = findAuthorizedNfseXml(document.response_payload);
  if (!authorizedXml) throw new Error("XML autorizado da NFS-e nao encontrado no retorno da SEFIN.");
  const pdf = await buildGovernmentDanfsePdf(authorizedXml);

  const number = clean(document.external_id) || document.id.slice(0, 8);
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
