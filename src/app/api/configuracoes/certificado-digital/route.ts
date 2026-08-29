import { NextRequest, NextResponse } from "next/server";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";
import { parsePfx, PfxValidationError } from "@/lib/certificates/pfx";
import { encryptCertificateSecret } from "@/lib/certificates/secrets";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const maxCertificateBytes = 2 * 1024 * 1024;

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/configuracoes/certificado-digital?status=${status}`, request.url), 303);
}

export async function POST(request: NextRequest) {
  const access = await requireCompanyPermission({ module: "configuracoes.certificado", action: "configurar", roles: ["master", "system_admin"] });
  if (!access.ok) {
    if (access.reason === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
    return redirectWith(request, access.reason === "forbidden" ? "forbidden" : "profile_error");
  }
  const actor = access.profile;

  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const file = formData.get("certificate");

  if (!password || !(file instanceof File) || !file.name) {
    return redirectWith(request, "missing");
  }

  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith(".pfx") && !fileName.endsWith(".p12")) {
    return redirectWith(request, "invalid_type");
  }

  if (file.size > maxCertificateBytes) {
    return redirectWith(request, "too_large");
  }

  let parsed: { label: string; validUntil: string };
  let pfxBase64: string;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    parsed = parsePfx(buffer, password);
    pfxBase64 = buffer.toString("base64");
  } catch (error) {
    const status = error instanceof PfxValidationError ? error.code : "invalid_certificate";
    console.error("Falha ao validar certificado digital:", error instanceof Error ? error.message : error);
    return redirectWith(request, status);
  }

  if (new Date(`${parsed.validUntil}T23:59:59.999Z`) < new Date()) {
    return redirectWith(request, "expired");
  }

  try {
    const service = createServiceClient();
    const { data: inserted, error } = await service.from("digital_certificates").insert({
      company_id: actor.company_id,
      label: parsed.label,
      encrypted_pfx: encryptCertificateSecret(pfxBase64),
      encrypted_password: encryptCertificateSecret(password),
      valid_until: parsed.validUntil,
      active: true
    }).select("id").single();

    if (error || !inserted) return redirectWith(request, "error");
    await service
      .from("digital_certificates")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("company_id", actor.company_id)
      .eq("active", true)
      .neq("id", inserted.id);

    await writeCompanyAudit({ companyId: actor.company_id, actorId: actor.id, entity: "digital_certificate", entityId: inserted.id, action: "activate", metadata: { label: parsed.label, validUntil: parsed.validUntil } });

    return redirectWith(request, "saved");
  } catch {
    return redirectWith(request, "error");
  }
}
