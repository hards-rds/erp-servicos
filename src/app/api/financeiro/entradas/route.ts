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

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/financeiro/entradas?status=${status}`, request.url), 303);
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

  if (!profile?.company_id) return redirectWith(request, "profile_error");

  const formData = await request.formData();
  const action = readString(formData, "action");
  const entryId = readString(formData, "entryId");

  if (action !== "receive" || !entryId) return redirectWith(request, "invalid");

  const { data: entry } = await supabase
    .from("financial_entries")
    .select("id,net_amount,status")
    .eq("id", entryId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (!entry || ["cancelado", "recebido", "conciliado"].includes(entry.status)) {
    return redirectWith(request, "invalid");
  }

  const receivedAt = readString(formData, "receivedAt") || new Date().toISOString().slice(0, 10);
  const paymentMethod = readString(formData, "paymentMethod");
  const receivedAmount = parseMoney(readString(formData, "receivedAmount")) ?? Number(entry.net_amount);

  if (!paymentMethod || receivedAmount < 0) return redirectWith(request, "invalid");

  const { error } = await supabase
    .from("financial_entries")
    .update({
      status: "recebido",
      received_at: receivedAt,
      received_amount: receivedAmount,
      payment_method: paymentMethod,
      payment_notes: readString(formData, "paymentNotes") || null,
      updated_by: profile.id,
      updated_at: new Date().toISOString()
    })
    .eq("id", entry.id)
    .eq("company_id", profile.company_id);

  if (error) return redirectWith(request, "receive_error");

  await supabase
    .from("sales")
    .update({
      status: "recebida",
      updated_by: profile.id,
      updated_at: new Date().toISOString()
    })
    .eq("financial_entry_id", entry.id)
    .eq("company_id", profile.company_id);

  return redirectWith(request, "received");
}
