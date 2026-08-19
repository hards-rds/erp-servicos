import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cancelStoredInterCharge, processInterCharge } from "@/server/services/inter-charge-service";

export const runtime = "nodejs";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/financeiro/boletos-cobrancas?status=${status}`, request.url), 303);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,company_id,active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.company_id || !profile.active) return redirectWith(request, "profile_error");

  const formData = await request.formData();
  const action = readString(formData, "action");
  let chargeId = readString(formData, "chargeId");

  if (action === "create") {
    const entryId = readString(formData, "entryId");
    const { data: entry } = await supabase
      .from("financial_entries")
      .select("id,due_date,status")
      .eq("id", entryId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (!entry || ["cancelado", "recebido", "conciliado"].includes(entry.status)) return redirectWith(request, "invalid");

    const idempotencyKey = `inter-charge:${entry.id}:${entry.due_date}`;
    const { data: charge, error } = await supabase.from("boleto_charges").upsert({
      company_id: profile.company_id,
      financial_entry_id: entry.id,
      status: "rascunho",
      idempotency_key: idempotencyKey,
      updated_at: new Date().toISOString()
    }, { onConflict: "company_id,idempotency_key" }).select("id").single();
    if (error || !charge?.id) return redirectWith(request, "create_error");
    chargeId = charge.id;
  }

  if (!chargeId || !["create", "process", "sync", "cancel"].includes(action)) return redirectWith(request, "invalid");
  const { data: charge } = await supabase
    .from("boleto_charges")
    .select("id,status")
    .eq("id", chargeId)
    .eq("company_id", profile.company_id)
    .maybeSingle();
  if (!charge) return redirectWith(request, "invalid");

  if (action === "cancel") {
    const reason = readString(formData, "reason");
    if (reason.length < 5) return redirectWith(request, "cancel_invalid");
    try {
      await cancelStoredInterCharge(profile.company_id, charge.id, reason, profile.id);
      return redirectWith(request, "cancelled");
    } catch {
      return redirectWith(request, "cancel_error");
    }
  }

  const result = await processInterCharge(profile.company_id, charge.id, profile.id);
  return redirectWith(request, result.ok ? (action === "sync" ? "synced" : "issued") : "inter_error");
}
