import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { onlyDigits } from "@/lib/validations/br-documents";

const segments = new Set(["tecnologia", "otica", "generico"]);

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id,role,active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.company_id) {
    return NextResponse.redirect(new URL("/configuracoes/gerais?status=profile_error", request.url), 303);
  }

  if (profile.role !== "master" || profile.active === false) {
    return NextResponse.redirect(new URL("/configuracoes/gerais?status=forbidden", request.url), 303);
  }

  const formData = await request.formData();
  const name = readString(formData, "name");
  const document = onlyDigits(readString(formData, "document"));
  const serviceSegment = readString(formData, "serviceSegment");

  if (!name || !segments.has(serviceSegment)) {
    return NextResponse.redirect(new URL("/configuracoes/gerais?status=invalid", request.url), 303);
  }

  const { error } = await supabase
    .from("companies")
    .update({
      name,
      document: document || null,
      service_segment: serviceSegment,
      updated_at: new Date().toISOString()
    })
    .eq("id", profile.company_id);

  return NextResponse.redirect(new URL(`/configuracoes/gerais?status=${error ? "error" : "saved"}`, request.url), 303);
}
