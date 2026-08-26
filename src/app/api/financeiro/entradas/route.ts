import { NextRequest, NextResponse } from "next/server";
import { getFinancialEntryDeletionBlocker } from "@/domains/finance/entry-deletion";
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
    .select("id,company_id,active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.company_id || profile.active === false) return redirectWith(request, "profile_error");

  const formData = await request.formData();
  const action = readString(formData, "action");
  const entryId = readString(formData, "entryId");

  if (action === "delete") {
    if (!entryId) return redirectWith(request, "delete_invalid");

    const { data: canDelete } = await supabase.rpc("app_has_permission", {
      permission_module: "financeiro.entradas",
      permission_action: "excluir"
    });
    if (!canDelete) return redirectWith(request, "delete_forbidden");

    const [{ data: entry }, nfseResult, chargeResult, reconciliationResult, saleResult] = await Promise.all([
      supabase
        .from("financial_entries")
        .select("id,status,received_at,nfse_document_id,charge_id")
        .eq("id", entryId)
        .eq("company_id", profile.company_id)
        .maybeSingle(),
      supabase.from("nfse_documents").select("id", { count: "exact", head: true }).eq("financial_entry_id", entryId).eq("company_id", profile.company_id),
      supabase.from("boleto_charges").select("id", { count: "exact", head: true }).eq("financial_entry_id", entryId).eq("company_id", profile.company_id),
      supabase.from("bank_reconciliations").select("id", { count: "exact", head: true }).eq("financial_entry_id", entryId).eq("company_id", profile.company_id),
      supabase.from("sales").select("id", { count: "exact", head: true }).eq("financial_entry_id", entryId).eq("company_id", profile.company_id)
    ]);

    if (!entry) return redirectWith(request, "delete_not_found");

    const blocker = getFinancialEntryDeletionBlocker({
      status: String(entry.status),
      receivedAt: entry.received_at as string | null,
      nfseDocumentId: entry.nfse_document_id as string | null,
      chargeId: entry.charge_id as string | null,
      nfseCount: nfseResult.count || 0,
      chargeCount: chargeResult.count || 0,
      reconciliationCount: reconciliationResult.count || 0,
      saleCount: saleResult.count || 0
    });
    if (blocker === "settled") return redirectWith(request, "delete_settled");
    if (blocker === "linked") return redirectWith(request, "delete_linked");

    const { data: deletedEntries, error } = await supabase
      .from("financial_entries")
      .delete()
      .eq("id", entry.id)
      .eq("company_id", profile.company_id)
      .select("id");

    if (error?.code === "23503") return redirectWith(request, "delete_linked");
    if (error) return redirectWith(request, "delete_error");
    if (!deletedEntries?.length) return redirectWith(request, "delete_not_found");
    return redirectWith(request, "deleted");
  }

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
