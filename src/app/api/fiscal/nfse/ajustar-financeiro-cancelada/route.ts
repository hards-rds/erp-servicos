import { NextRequest, NextResponse } from "next/server";
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
    supabase.from("profiles").select("company_id,active").eq("id", user.id).maybeSingle(),
    supabase.rpc("app_has_permission", { permission_module: "fiscal.nfse", permission_action: "editar" })
  ]);
  if (!profile?.company_id || profile.active === false || !canEdit) return redirect(request, "forbidden");

  const formData = await request.formData();
  const documentId = String(formData.get("nfseDocumentId") || "").trim();
  const { data: document } = await supabase
    .from("nfse_documents")
    .select("id,status,financial_entry_id")
    .eq("id", documentId)
    .eq("company_id", profile.company_id)
    .maybeSingle();
  if (!document || document.status !== "cancelada") return redirect(request, "invalid");
  if (!document.financial_entry_id) return redirect(request, "cancelled_finance_cleared");

  const { data: entry } = await supabase
    .from("financial_entries")
    .select("id,status,received_at")
    .eq("id", document.financial_entry_id)
    .eq("company_id", profile.company_id)
    .maybeSingle();
  if (!entry || entry.status === "cancelado") return redirect(request, "cancelled_finance_cleared");
  if (entry.received_at || ["recebido", "conciliado"].includes(entry.status)) {
    return redirect(request, "cancelled_finance_blocked");
  }

  const { error } = await supabase
    .from("financial_entries")
    .update({ status: "cancelado", updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", entry.id)
    .eq("company_id", profile.company_id);
  return redirect(request, error ? "error" : "cancelled_finance_cleared", error?.message);
}
