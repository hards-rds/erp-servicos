import { NextRequest, NextResponse } from "next/server";
import { DOMParser } from "@xmldom/xmldom";
import { loadRuntimeCertificate } from "@/lib/certificates/runtime-certificate";
import {
  requestNfseCancellation,
  type NfseCancellationReasonCode
} from "@/lib/integrations/nfse-cancellation";
import { decodeNfseXml } from "@/lib/integrations/nfse-transport";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function redirectWithMessage(request: NextRequest, status: string, message: string) {
  const target = new URL("/fiscal/notas-emitidas", request.url);
  target.searchParams.set("status", status);
  target.searchParams.set("message", message);
  return NextResponse.redirect(target, 303);
}

function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function responseAccessKey(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const row = payload as Record<string, unknown>;
  const directKey = onlyDigits(row.chaveAcesso || row.chave_acesso || row.protocolo);
  if (directKey.length === 50) return directKey;

  if (typeof row.nfseXmlGZipB64 !== "string") return "";
  try {
    const document = new DOMParser().parseFromString(decodeNfseXml(row.nfseXmlGZipB64));
    const keyElement = document.getElementsByTagNameNS("*", "chNFSe")[0];
    const keyFromElement = onlyDigits(keyElement?.textContent);
    if (keyFromElement.length === 50) return keyFromElement;

    const infoElement = document.getElementsByTagNameNS("*", "infNFSe")[0];
    const keyFromId = onlyDigits(infoElement?.getAttribute("Id"));
    return keyFromId.length === 50 ? keyFromId : "";
  } catch {
    return "";
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);

  try {
    const formData = await request.formData();
    const nfseDocumentId = String(formData.get("nfseDocumentId") || "").trim();
    const reasonCode = String(formData.get("reasonCode") || "").trim() as NfseCancellationReasonCode;
    const reason = String(formData.get("reason") || "").trim();

    if (!nfseDocumentId) return redirectWithMessage(request, "invalid", "Documento fiscal invalido.");
    if (formData.get("productionConfirmed") !== "true") {
      return redirectWithMessage(request, "cancel_rejected", "Confirme explicitamente o cancelamento real da NFS-e.");
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id,company_id,active")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.company_id || profile.active === false) {
      return redirectWithMessage(request, "profile_error", "Seu usuario nao esta ativo ou vinculado a uma empresa.");
    }

    const { data: canCancel } = await supabase.rpc("app_has_permission", {
      permission_module: "fiscal.nfse",
      permission_action: "cancelar"
    });
    if (!canCancel) return redirectWithMessage(request, "forbidden", "Seu usuario nao possui permissao para cancelar NFS-e.");

    const { data: document } = await supabase
      .from("nfse_documents")
      .select("id,company_id,status,protocol,response_payload,companies(document)")
      .eq("id", nfseDocumentId)
      .eq("company_id", profile.company_id)
      .maybeSingle();

    if (!document) return redirectWithMessage(request, "not_found", "Documento fiscal nao encontrado.");
    if (document.status === "cancelada") return redirectWithMessage(request, "cancelled", "Esta NFS-e ja esta cancelada.");
    if (document.status !== "autorizada") {
      return redirectWithMessage(request, "cancel_rejected", "Somente uma NFS-e autorizada pode ser cancelada.");
    }

    const company = Array.isArray(document.companies) ? document.companies[0] : document.companies;
    const accessKey = onlyDigits(document.protocol) || responseAccessKey(document.response_payload);
    const runtimeCertificate = await loadRuntimeCertificate(profile.company_id);
    const result = await requestNfseCancellation({
      accessKey,
      companyDocument: company?.document || "",
      reasonCode,
      reason
    }, runtimeCertificate.certificate, runtimeCertificate.error);

    const service = createServiceClient();
    await service.from("nfse_events").insert({
      nfse_document_id: document.id,
      status: result.ok ? "cancelada" : "cancelamento_rejeitado",
      message: result.message,
      payload: {
        eventCode: "101101",
        reasonCode,
        reason,
        request: result.requestPayload || {},
        response: result.responsePayload || {}
      },
      created_by: profile.id
    });

    if (result.ok) {
      const { error: updateError } = await service
        .from("nfse_documents")
        .update({
          status: "cancelada",
          rejection_message: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", document.id)
        .eq("company_id", profile.company_id)
        .eq("status", "autorizada");

      if (updateError) {
        return redirectWithMessage(
          request,
          "cancel_error",
          "A SEFIN confirmou o cancelamento, mas o status local nao foi atualizado. Nao tente cancelar novamente."
        );
      }
    }

    return redirectWithMessage(request, result.ok ? "cancelled" : "cancel_rejected", result.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao cancelar a NFS-e.";
    return redirectWithMessage(request, "cancel_error", message);
  }
}
