import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function read(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id,role,active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.company_id || profile.active === false) {
    return NextResponse.redirect(new URL("/configuracoes/emails?status=profile_error", request.url), 303);
  }
  if (!["master", "system_admin"].includes(profile.role)) {
    return NextResponse.redirect(new URL("/configuracoes/emails?status=forbidden", request.url), 303);
  }

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

  return NextResponse.redirect(new URL(`/configuracoes/emails?status=${error ? "error" : "saved"}`, request.url), 303);
}
