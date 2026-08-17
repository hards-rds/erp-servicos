import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { generateAndAttachDanfsePdf } from "@/lib/fiscal/danfse";
import { downloadPrivateFile, type StoredFile } from "@/lib/files/app-files";

export const runtime = "nodejs";

function redirectWith(request: NextRequest, status: string, message: string) {
  const target = new URL("/fiscal/notas-emitidas", request.url);
  target.searchParams.set("status", status);
  target.searchParams.set("message", message);
  return NextResponse.redirect(target, 303);
}

async function requireDocumentAccess(documentId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return { error: "unauthenticated" as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,company_id,active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.company_id || profile.active === false) return { error: "profile" as const };

  const { data: document } = await supabase
    .from("nfse_documents")
    .select("id,company_id,danfse_file_id,status")
    .eq("id", documentId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (!document) return { error: "not_found" as const };
  return { profile, document };
}

export async function GET(request: NextRequest) {
  const documentId = request.nextUrl.searchParams.get("id") || "";
  const access = await requireDocumentAccess(documentId);

  if ("error" in access) {
    if (access.error === "unauthenticated") return NextResponse.redirect(new URL("/login", request.url), 303);
    return redirectWith(request, access.error || "not_found", "DANFSe nao encontrado.");
  }

  try {
    let fileId = access.document.danfse_file_id as string | null;
    if (!fileId) {
      const generated = await generateAndAttachDanfsePdf(access.document.id, access.profile.id);
      fileId = generated.fileId;
    }

    const service = createServiceClient();
    const { data: file } = await service
      .from("files")
      .select("id,storage_bucket,storage_path,content_type")
      .eq("id", fileId)
      .eq("company_id", access.profile.company_id)
      .maybeSingle();

    if (!file) return redirectWith(request, "not_found", "Arquivo do DANFSe nao encontrado.");

    const content = await downloadPrivateFile(file as StoredFile);
    const fileName = file.storage_path.split("/").pop() || "danfse.pdf";
    return new NextResponse(content, {
      headers: {
        "content-type": file.content_type || "application/pdf",
        "content-disposition": `attachment; filename="${fileName}"`
      }
    });
  } catch (error) {
    return redirectWith(
      request,
      "pdf_error",
      error instanceof Error ? error.message : "Nao foi possivel gerar o DANFSe."
    );
  }
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const documentId = String(formData.get("nfseDocumentId") || "").trim();
  const access = await requireDocumentAccess(documentId);

  if ("error" in access) {
    if (access.error === "unauthenticated") return NextResponse.redirect(new URL("/login", request.url), 303);
    return redirectWith(request, access.error || "not_found", "Documento fiscal nao encontrado.");
  }

  try {
    await generateAndAttachDanfsePdf(access.document.id, access.profile.id);
    return redirectWith(request, "pdf_generated", "DANFSe gerado e anexado a nota.");
  } catch (error) {
    return redirectWith(
      request,
      "pdf_error",
      error instanceof Error ? error.message : "Nao foi possivel gerar o DANFSe."
    );
  }
}
