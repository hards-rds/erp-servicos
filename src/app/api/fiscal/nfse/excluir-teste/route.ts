import { NextRequest, NextResponse } from "next/server";
import { findAuthorizedNfseXml } from "@/lib/fiscal/nfse-xml";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function redirect(request: NextRequest, status: string, message?: string) {
  const target = new URL("/fiscal/emissao-nfse", request.url);
  target.searchParams.set("status", status);
  if (message) target.searchParams.set("message", message);
  return NextResponse.redirect(target, 303);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);

  const [{ data: profile }, { data: canEdit }] = await Promise.all([
    supabase.from("profiles").select("id,company_id,active").eq("id", user.id).maybeSingle(),
    supabase.rpc("app_has_permission", { permission_module: "fiscal.nfse", permission_action: "editar" })
  ]);
  if (!profile?.company_id || profile.active === false || !canEdit) {
    return redirect(request, "forbidden", "Seu usuario nao pode excluir documentos fiscais de teste.");
  }

  const formData = await request.formData();
  const documentId = String(formData.get("nfseDocumentId") || "").trim();
  const { data: document } = await supabase
    .from("nfse_documents")
    .select("id,status,response_payload,financial_entry_id")
    .eq("id", documentId)
    .eq("company_id", profile.company_id)
    .maybeSingle();
  if (!document) return redirect(request, "not_found");

  const deletableStatuses = ["rascunho", "validada", "enfileirada", "rejeitada", "erro_integracao"];
  if (!deletableStatuses.includes(String(document.status)) || findAuthorizedNfseXml(document.response_payload)) {
    return redirect(request, "delete_blocked", "Notas autorizadas ou canceladas devem permanecer no historico fiscal.");
  }

  const entryId = document.financial_entry_id as string | null;
  let deleteEntry = false;
  if (entryId) {
    const [{ data: entry }, chargeResult, reconciliationResult, saleResult] = await Promise.all([
      supabase.from("financial_entries").select("id,status,received_at,charge_id").eq("id", entryId).eq("company_id", profile.company_id).maybeSingle(),
      supabase.from("boleto_charges").select("id", { count: "exact", head: true }).eq("financial_entry_id", entryId).eq("company_id", profile.company_id),
      supabase.from("bank_reconciliations").select("id", { count: "exact", head: true }).eq("financial_entry_id", entryId).eq("company_id", profile.company_id),
      supabase.from("sales").select("id", { count: "exact", head: true }).eq("financial_entry_id", entryId).eq("company_id", profile.company_id)
    ]);
    deleteEntry = Boolean(entry
      && ["previsto", "emitido"].includes(entry.status)
      && !entry.received_at
      && !entry.charge_id
      && !chargeResult.count
      && !reconciliationResult.count
      && !saleResult.count);
  }

  const { error: documentError } = await supabase
    .from("nfse_documents")
    .delete()
    .eq("id", document.id)
    .eq("company_id", profile.company_id);
  if (documentError) return redirect(request, "delete_error", documentError.message);

  if (entryId && deleteEntry) {
    const { error: entryError } = await supabase
      .from("financial_entries")
      .delete()
      .eq("id", entryId)
      .eq("company_id", profile.company_id);
    if (entryError) return redirect(request, "deleted_finance_kept", "Documento excluido, mas o lancamento possui outra vinculacao e foi preservado.");
  } else if (entryId) {
    await supabase
      .from("financial_entries")
      .update({ nfse_document_id: null, updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("id", entryId)
      .eq("company_id", profile.company_id);
  }

  return redirect(request, !entryId || deleteEntry ? "test_deleted" : "deleted_finance_kept");
}
