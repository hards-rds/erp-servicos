import { NextRequest, NextResponse } from "next/server";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";
import { createServiceClient } from "@/lib/supabase/server";
import { generateAndAttachDanfsePdf } from "@/lib/fiscal/danfse";
import { logFiscalEmail, sendFiscalDocumentEmail } from "@/lib/email/fiscal-email";
import { resolveOfficialNfseNumber } from "@/lib/fiscal/nfse-xml";
import { getStoredInterChargePdf } from "@/server/services/inter-charge-service";

export const runtime = "nodejs";

function redirectWith(request: NextRequest, status: string, message: string) {
  const target = new URL("/fiscal/notas-emitidas", request.url);
  target.searchParams.set("status", status);
  target.searchParams.set("message", message);
  return NextResponse.redirect(target, 303);
}

function row(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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
      .select("id,company_id,status,external_id,response_payload,request_payload,financial_entry_id,competence,clients(legal_name,fiscal_email)")
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
    const number = resolveOfficialNfseNumber(document.external_id, document.response_payload);
    const attachments = [{
      filename: generated.fileName,
      content: generated.content,
      contentType: "application/pdf"
    }];
    const includeCharge = document.status === "autorizada"
      && row(document.request_payload).issueChargeRequested === true
      && Boolean(document.financial_entry_id);
    let chargeId: string | null = null;
    if (includeCharge) {
      const { data: charge } = await service
        .from("boleto_charges")
        .select("id")
        .eq("company_id", document.company_id)
        .eq("financial_entry_id", document.financial_entry_id)
        .neq("status", "cancelada")
        .not("external_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!charge?.id) throw new Error("O boleto solicitado ainda nao esta disponivel para envio.");
      chargeId = charge.id;
      const boletoPdf = await getStoredInterChargePdf(document.company_id, charge.id, profile.id);
      attachments.push({ filename: `boleto-${document.competence}.pdf`, content: boletoPdf, contentType: "application/pdf" });
    }

    const subject = `${number ? `NFS-e ${number}` : "Documento NFS-e"}${includeCharge ? " e boleto" : ""} - Mundo Livre tecnologia`;
    const result = await sendFiscalDocumentEmail({
      companyId: document.company_id,
      to: recipient,
      subject,
      html: `
        <p>Ola, ${client?.legal_name || "cliente"}.</p>
        <p>Segue em anexo o DANFSe${includeCharge ? " e o boleto do Banco Inter" : ""} referente${includeCharge ? "s" : ""} a competencia ${document.competence}.</p>
        <p>Atenciosamente,<br/>Mundo Livre tecnologia</p>
      `,
      attachments
    });

    await logFiscalEmail({
      companyId: document.company_id,
      recipient: recipient || "-",
      subject,
      result,
      metadata: { nfseDocumentId: document.id, boletoChargeId: chargeId, combined: includeCharge }
    });

    if (result.ok) await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "nfse_document", entityId: document.id, action: "send_email", metadata: { recipient } });

    return redirectWith(
      request,
      result.ok ? "email_sent" : "email_error",
      result.ok
        ? `${includeCharge ? "DANFSe e boleto enviados" : "DANFSe enviado"} para o email fiscal do cliente.`
        : (result.error || "Nao foi possivel enviar o email.")
    );
  } catch (error) {
    return redirectWith(
      request,
      "email_error",
      error instanceof Error ? error.message : "Nao foi possivel enviar o email."
    );
  }
}
