import { NextRequest, NextResponse } from "next/server";
import { canMarkPayablePaid, getPayableMutationBlocker } from "@/domains/finance/payables";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const allowedStatuses = new Set(["previsto", "aprovado", "pago"]);
const allowedEditStatuses = new Set(["previsto", "aprovado", "vencido", "cancelado"]);

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function parseMoney(value: string) {
  const compact = value.replace(/\s/g, "");
  const normalized = compact.includes(",")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/financeiro/saidas?status=${status}`, request.url), 303);
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
  const action = readString(formData, "action") || "create";
  const payableId = readString(formData, "payableId");

  if (["update", "pay"].includes(action)) {
    if (!payableId) return redirectWith(request, "invalid");

    const permissionAction = action === "pay" ? "aprovar" : "editar";
    const { data: allowed } = await supabase.rpc("app_has_permission", {
      permission_module: "financeiro.saidas",
      permission_action: permissionAction
    });
    if (!allowed) return redirectWith(request, "forbidden");

    const [{ data: payable }, commissionResult, reconciliationResult] = await Promise.all([
      supabase
        .from("payables")
        .select("id,vendor_name,category,description,competence,due_date,amount,status,notes")
        .eq("id", payableId)
        .eq("company_id", profile.company_id)
        .maybeSingle(),
      supabase.from("commissions").select("id", { count: "exact", head: true }).eq("payable_id", payableId).eq("company_id", profile.company_id),
      supabase.from("bank_reconciliations").select("id", { count: "exact", head: true }).eq("payable_id", payableId).eq("company_id", profile.company_id)
    ]);
    if (!payable) return redirectWith(request, "not_found");

    const blocker = getPayableMutationBlocker({
      status: payable.status,
      commissionCount: commissionResult.count || 0,
      reconciliationCount: reconciliationResult.count || 0
    });
    if (blocker === "settled") return redirectWith(request, "settled");
    if (blocker === "linked") return redirectWith(request, "linked");

    const now = new Date().toISOString();
    if (action === "pay") {
      const paidAt = readString(formData, "paidAt");
      const paymentMethod = readString(formData, "paymentMethod");
      if (!canMarkPayablePaid(payable.status) || !/^\d{4}-\d{2}-\d{2}$/.test(paidAt) || !paymentMethod) {
        return redirectWith(request, "invalid");
      }
      const paymentNotes = readString(formData, "paymentNotes");
      const notes = paymentNotes
        ? [payable.notes, `Pagamento: ${paymentNotes}`].filter(Boolean).join(" · ")
        : payable.notes;
      const { data: updated, error } = await supabase
        .from("payables")
        .update({
          status: "pago",
          paid_at: paidAt,
          payment_method: paymentMethod,
          paid_by: profile.id,
          approved_by: profile.id,
          notes,
          updated_by: profile.id,
          updated_at: now
        })
        .eq("id", payable.id)
        .eq("company_id", profile.company_id)
        .eq("status", payable.status)
        .select("id");
      if (error || !updated?.length) return redirectWith(request, "payment_error");
      return redirectWith(request, "paid");
    }

    const vendorName = readString(formData, "vendorName");
    const category = readString(formData, "category");
    const description = readString(formData, "description");
    const competence = readString(formData, "competence");
    const dueDate = readString(formData, "dueDate");
    const status = readString(formData, "status");
    const amount = parseMoney(readString(formData, "amount"));
    const invalidUpdate = !vendorName || !category || !description || !/^\d{4}-\d{2}$/.test(competence)
      || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !allowedEditStatuses.has(status) || amount === null || amount <= 0;
    if (invalidUpdate) return redirectWith(request, "invalid");

    const { data: updated, error } = await supabase
      .from("payables")
      .update({
        vendor_name: vendorName,
        category,
        description,
        competence,
        due_date: dueDate,
        amount,
        status,
        notes: readString(formData, "notes") || null,
        approved_by: status === "aprovado" ? profile.id : null,
        updated_by: profile.id,
        updated_at: now
      })
      .eq("id", payable.id)
      .eq("company_id", profile.company_id)
      .eq("status", payable.status)
      .select("id");
    if (error || !updated?.length) return redirectWith(request, "update_error");
    return redirectWith(request, "updated");
  }

  if (action !== "create") return redirectWith(request, "invalid");
  const vendorName = readString(formData, "vendorName");
  const category = readString(formData, "category");
  const description = readString(formData, "description");
  const competence = readString(formData, "competence");
  const dueDate = readString(formData, "dueDate");
  const status = readString(formData, "status");
  const amount = parseMoney(readString(formData, "amount"));
  const paidAt = readString(formData, "paidAt");
  const paymentMethod = readString(formData, "paymentMethod");

  const invalid =
    !vendorName ||
    !category ||
    !description ||
    !/^\d{4}-\d{2}$/.test(competence) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
    !allowedStatuses.has(status) ||
    amount === null ||
    amount <= 0 ||
    (status === "pago" && (!paidAt || !paymentMethod));

  if (invalid) return redirectWith(request, "invalid");

  const now = new Date().toISOString();
  const { error } = await supabase.from("payables").insert({
    company_id: profile.company_id,
    vendor_name: vendorName,
    category,
    description,
    competence,
    due_date: dueDate,
    amount,
    status,
    paid_at: status === "pago" ? paidAt : null,
    payment_method: status === "pago" ? paymentMethod : null,
    approved_by: ["aprovado", "pago"].includes(status) ? profile.id : null,
    paid_by: status === "pago" ? profile.id : null,
    notes: readString(formData, "notes") || null,
    created_by: profile.id,
    updated_by: profile.id,
    created_at: now,
    updated_at: now
  });

  if (error) return redirectWith(request, "error");

  return redirectWith(request, "created");
}
