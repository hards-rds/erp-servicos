import { NextRequest, NextResponse } from "next/server";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";
import { createServiceClient } from "@/lib/supabase/server";
import { generateAndAttachDanfsePdf } from "@/lib/fiscal/danfse";
import { logFiscalEmail, sendFiscalDocumentEmail } from "@/lib/email/fiscal-email";

export const runtime = "nodejs";

function redirectWith(request: NextRequest, status: string, message: string) {
  const target = new URL("/fiscal/notas-emitidas", request.url);
  target.searchParams.set("status", status);
  target.searchParams.set("message", message);
  return NextResponse.redirect(target, 303);
}

export async function POST(request: NextRequest) {
  const access = await requireCompanyPermission({ module: "fiscal.notas", action: "emitir" });
  if (!access.ok) {
    if (access.reason === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
    return redirectWith(request, "forbidden", "Voce nao possui permissao para enviar documentos fiscais.");
  }
  const { profile } = access;

  const formData = await request.formData();
  const documentId = String(formData.get("nfseDocumentId") || "").trim();

  try {
    const service = createServiceClient();
    const { data: document } = await service
      .from("nfse_documents")
      .select("id,company_id,status,external_id,competence,clients(legal_name,fiscal_email)")
      .eq("id", documentId)
      .eq("company_id", profile.company_id)
      .maybeSingle();

    if (!document) return redirectWith(request, "not_found", "Documento fiscal nao encontrado.");
    if (!["autorizada", "cancelada"].includes(String(document.status))) {
      return redirectWith(request, "email_error", "Envio disponivel somente para NFS-e autorizada ou cancelada.");
    }

    const client = Array.isArray(document.clients) ? document.clients[0] : document.clients;
    const recipient = client?.fiscal_email || "";
    const generated = await generateAndAttachDanfsePdf(document.id, profile.id);
    const subject = `NFS-e ${document.external_id || document.id.slice(0, 8)} - Mundo Livre tecnologia`;
    const result = await sendFiscalDocumentEmail({
      companyId: document.company_id,
      to: recipient,
      subject,
      html: `
        <p>Ola, ${client?.legal_name || "cliente"}.</p>
        <p>Segue em anexo o DANFSe referente a competencia ${document.competence}.</p>
        <p>Atenciosamente,<br/>Mundo Livre tecnologia</p>
      `,
      attachments: [{
        filename: generated.fileName,
        content: generated.content,
        contentType: "application/pdf"
      }]
    });

    await logFiscalEmail({
      companyId: document.company_id,
      recipient: recipient || "-",
      subject,
      result,
      metadata: { nfseDocumentId: document.id }
    });

    if (result.ok) await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "nfse_document", entityId: document.id, action: "send_email", metadata: { recipient } });

    return redirectWith(
      request,
      result.ok ? "email_sent" : "email_error",
      result.ok ? "DANFSe enviado para o email fiscal do cliente." : (result.error || "Nao foi possivel enviar o email.")
    );
  } catch (error) {
    return redirectWith(
      request,
      "email_error",
      error instanceof Error ? error.message : "Nao foi possivel enviar o email."
    );
  }
}
