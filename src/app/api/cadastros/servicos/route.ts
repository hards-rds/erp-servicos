import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function parseMoney(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
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
    .select("id,company_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.company_id) {
    return NextResponse.redirect(new URL("/cadastros/servicos?status=profile_error", request.url), 303);
  }

  const formData = await request.formData();
  const clientId = readString(formData, "clientId");
  const serviceDescription = readString(formData, "serviceDescription");
  const amount = parseMoney(readString(formData, "amount"));

  if (!clientId || !serviceDescription || amount === null || amount < 0) {
    return NextResponse.redirect(new URL("/cadastros/servicos?status=invalid", request.url), 303);
  }

  const { error } = await supabase.from("service_records").insert({
    company_id: profile.company_id,
    client_id: clientId,
    service_description: serviceDescription,
    service_type: readString(formData, "serviceType") || "avulso",
    amount,
    service_date: readString(formData, "serviceDate") || new Date().toISOString().slice(0, 10),
    due_date: readString(formData, "dueDate") || null,
    status: readString(formData, "status") || "rascunho",
    notes: readString(formData, "notes") || null,
    created_by: profile.id,
    updated_by: profile.id
  });

  return NextResponse.redirect(new URL(`/cadastros/servicos?status=${error ? "error" : "created"}`, request.url), 303);
}
