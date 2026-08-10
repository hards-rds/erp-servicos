import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { parsePfx, PfxValidationError } from "@/lib/certificates/pfx";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const maxCertificateBytes = 2 * 1024 * 1024;

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/configuracoes/certificado-digital?status=${status}`, request.url), 303);
}

function encryptionKey() {
  const secret = process.env.CERTIFICATE_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Chave de criptografia do certificado nao configurada.");
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

async function getMasterActor() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return { actor: null, error: "unauthorized" };

  const { data: actor } = await supabase
    .from("profiles")
    .select("id,company_id,role,active")
    .eq("id", user.id)
    .maybeSingle();

  if (!actor?.company_id || actor.role !== "master" || actor.active === false) {
    return { actor: null, error: "forbidden" };
  }

  return { actor, error: null };
}

export async function POST(request: NextRequest) {
  const { actor, error: actorError } = await getMasterActor();
  if (actorError === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
  if (!actor) return redirectWith(request, "forbidden");

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
    await service
      .from("digital_certificates")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("company_id", actor.company_id)
      .eq("active", true);

    const { error } = await service.from("digital_certificates").insert({
      company_id: actor.company_id,
      label: parsed.label,
      encrypted_pfx: encryptSecret(pfxBase64),
      encrypted_password: encryptSecret(password),
      valid_until: parsed.validUntil,
      active: true
    });

    return redirectWith(request, error ? "error" : "saved");
  } catch {
    return redirectWith(request, "error");
  }
}
