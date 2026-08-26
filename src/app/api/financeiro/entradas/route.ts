import { NextRequest, NextResponse } from "next/server";
import {
  getFinancialEntryDeletionBlocker,
  isProtectedInterChargeForEntryDeletion,
  isProtectedNfseForEntryDeletion
} from "@/domains/finance/entry-deletion";
import { findAuthorizedNfseXml } from "@/lib/fiscal/nfse-xml";
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

    const { data: entry } = await supabase
      .from("financial_entries")
      .select("id,status,received_at,nfse_document_id,charge_id")
      .eq("id", entryId)
      .eq("company_id", profile.company_id)
      .maybeSingle();

    if (!entry) return redirectWith(request, "delete_not_found");

    const nfseFilter = [
      `financial_entry_id.eq.${entryId}`,
      entry.nfse_document_id ? `id.eq.${entry.nfse_document_id}` : null
    ].filter(Boolean).join(",");
    const chargeFilter = [
      `financial_entry_id.eq.${entryId}`,
      entry.charge_id ? `id.eq.${entry.charge_id}` : null
    ].filter(Boolean).join(",");

    const [nfseResult, chargeResult, reconciliationResult, saleResult] = await Promise.all([
      supabase
        .from("nfse_documents")
        .select("id,status,response_payload,financial_entry_id")
        .eq("company_id", profile.company_id)
        .or(nfseFilter),
      supabase
        .from("boleto_charges")
        .select("id,status,external_id,financial_entry_id")
        .eq("company_id", profile.company_id)
        .or(chargeFilter),
      supabase.from("bank_reconciliations").select("id", { count: "exact", head: true }).eq("financial_entry_id", entryId).eq("company_id", profile.company_id),
      supabase.from("sales").select("id", { count: "exact", head: true }).eq("financial_entry_id", entryId).eq("company_id", profile.company_id)
    ]);

    if (nfseResult.error || chargeResult.error || reconciliationResult.error || saleResult.error) {
      return redirectWith(request, "delete_check_error");
    }

    const nfseDocuments = nfseResult.data || [];
    const protectedNfseDocuments = nfseDocuments.filter((document) => {
      const linkedToAnotherEntry = Boolean(
        document.financial_entry_id && document.financial_entry_id !== entry.id
      );
      return linkedToAnotherEntry || isProtectedNfseForEntryDeletion(
        String(document.status),
        Boolean(findAuthorizedNfseXml(document.response_payload))
      );
    });
    const removableNfseDocuments = nfseDocuments.filter((document) =>
      !protectedNfseDocuments.some((protectedDocument) => protectedDocument.id === document.id)
    );
    const charges = chargeResult.data || [];
    const protectedCharges = charges.filter((charge) => {
      const linkedToAnotherEntry = Boolean(
        charge.financial_entry_id && charge.financial_entry_id !== entry.id
      );
      return linkedToAnotherEntry || isProtectedInterChargeForEntryDeletion(
        String(charge.status),
        Boolean(charge.external_id)
      );
    });
    const removableCharges = charges.filter((charge) =>
      !protectedCharges.some((protectedCharge) => protectedCharge.id === charge.id)
    );

    const blocker = getFinancialEntryDeletionBlocker({
      status: String(entry.status),
      receivedAt: entry.received_at as string | null,
      nfseCount: protectedNfseDocuments.length,
      chargeCount: protectedCharges.length,
      reconciliationCount: reconciliationResult.count || 0,
      saleCount: saleResult.count || 0
    });
    if (blocker === "settled") return redirectWith(request, "delete_settled");
    if (blocker) return redirectWith(request, `delete_${blocker}`);

    const linkedRemovableDocumentIds = removableNfseDocuments
      .filter((document) => document.financial_entry_id === entry.id)
      .map((document) => document.id);
    if (linkedRemovableDocumentIds.length) {
      const { error: detachError } = await supabase
        .from("nfse_documents")
        .update({ financial_entry_id: null, updated_at: new Date().toISOString() })
        .eq("company_id", profile.company_id)
        .in("id", linkedRemovableDocumentIds);
      if (detachError) return redirectWith(request, "delete_error");
    }

    const removableChargeIds = removableCharges.map((charge) => charge.id);
    if (removableChargeIds.length) {
      const { error: chargeDeleteError } = await supabase
        .from("boleto_charges")
        .delete()
        .eq("company_id", profile.company_id)
        .in("id", removableChargeIds);
      if (chargeDeleteError) {
        if (linkedRemovableDocumentIds.length) {
          await supabase
            .from("nfse_documents")
            .update({ financial_entry_id: entry.id, updated_at: new Date().toISOString() })
            .eq("company_id", profile.company_id)
            .in("id", linkedRemovableDocumentIds);
        }
        return redirectWith(request, "delete_error");
      }
    }

    const { data: deletedEntries, error } = await supabase
      .from("financial_entries")
      .delete()
      .eq("id", entry.id)
      .eq("company_id", profile.company_id)
      .select("id");

    if (error) {
      if (linkedRemovableDocumentIds.length) {
        await supabase
          .from("nfse_documents")
          .update({ financial_entry_id: entry.id, updated_at: new Date().toISOString() })
          .eq("company_id", profile.company_id)
          .in("id", linkedRemovableDocumentIds);
      }
      if (error.code === "23503") return redirectWith(request, "delete_linked");
      return redirectWith(request, "delete_error");
    }
    if (!deletedEntries?.length) return redirectWith(request, "delete_not_found");

    const removableDocumentIds = removableNfseDocuments.map((document) => document.id);
    if (removableDocumentIds.length) {
      await supabase
        .from("nfse_documents")
        .delete()
        .eq("company_id", profile.company_id)
        .in("id", removableDocumentIds);
    }
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
