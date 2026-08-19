import { NextRequest, NextResponse } from "next/server";
import { findAuthorizedNfseXml } from "@/lib/fiscal/nfse-xml";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id,active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.company_id || profile.active === false) {
    return NextResponse.json({ error: "Usuario sem empresa ativa." }, { status: 403 });
  }

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

  const number = String(document.external_id || document.id.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, "");
  return new NextResponse(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="nfse-${number || document.id.slice(0, 8)}.xml"`,
      "cache-control": "private, no-store"
    }
  });
}

