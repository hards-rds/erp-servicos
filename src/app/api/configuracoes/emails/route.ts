import { NextRequest, NextResponse } from "next/server";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function read(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

export async function POST(request: NextRequest) {
  const access = await requireCompanyPermission({ module: "configuracoes.emails", action: "configurar", roles: ["master", "system_admin"] });
  if (!access.ok) {
    if (access.reason === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
    return NextResponse.redirect(new URL(`/configuracoes/emails?status=${access.reason === "forbidden" ? "forbidden" : "profile_error"}`, request.url), 303);
  }
  const { profile } = access;

  const formData = await request.formData();
  const provider = read(formData, "provider").toLowerCase();
  const emailFrom = read(formData, "emailFrom");
  const replyTo = read(formData, "replyTo");
  if (!["resend", "sendgrid", ""].includes(provider) || !emailFrom) {
    return NextResponse.redirect(new URL("/configuracoes/emails?status=invalid", request.url), 303);
  }

  const payload = {
    company_id: profile.company_id,
    provider,
    email_from: emailFrom,
    reply_to: replyTo || null,
    updated_at: new Date().toISOString()
  };
  const service = createServiceClient();
  const { data: existing } = await service
    .from("email_settings")
    .select("id")
    .eq("company_id", profile.company_id)
    .maybeSingle();
  const { error } = existing?.id
    ? await service.from("email_settings").update(payload).eq("id", existing.id)
    : await service.from("email_settings").insert(payload);

  if (!error) await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "email_settings", entityId: existing?.id || null, action: "configure", metadata: { provider, emailFrom } });

  return NextResponse.redirect(new URL(`/configuracoes/emails?status=${error ? "error" : "saved"}`, request.url), 303);
}
