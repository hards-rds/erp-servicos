import { NextRequest, NextResponse } from "next/server";
import { requireCompanyPermission } from "@/lib/auth/api-access";
import { findAuthorizedNfseXml, resolveOfficialNfseNumber } from "@/lib/fiscal/nfse-xml";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await requireCompanyPermission({ module: "fiscal.notas", action: "visualizar" });
  if (!access.ok) return NextResponse.json({ error: access.reason === "unauthorized" ? "Nao autenticado." : "Acesso negado." }, { status: access.reason === "unauthorized" ? 401 : 403 });
  const { supabase, profile } = access;

  const documentId = request.nextUrl.searchParams.get("id") || "";
  const { data: document } = await supabase
    .from("nfse_documents")
    .select("id,status,external_id,response_payload")
    .eq("id", documentId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (!document || !["autorizada", "cancelada"].includes(document.status)) {
    return NextResponse.json({ error: "XML disponivel somente para NFS-e autorizada ou cancelada." }, { status: 404 });
  }

  const xml = findAuthorizedNfseXml(document.response_payload);
  if (!xml) return NextResponse.json({ error: "XML autorizado nao encontrado." }, { status: 404 });

  const number = String(resolveOfficialNfseNumber(document.external_id, document.response_payload) || `sem-numero-${document.id.slice(0, 8)}`)
    .replace(/[^a-zA-Z0-9_-]/g, "");
  return new NextResponse(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="nfse-${number}.xml"`,
      "cache-control": "private, no-store"
    }
  });
}
