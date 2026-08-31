import { NextRequest, NextResponse } from "next/server";
import { canMarkPayablePaid, getPayableMutationBlocker } from "@/domains/finance/payables";
import { isPayableScheduleType } from "@/domains/finance/payable-schedules";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";

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
  const formData = await request.formData();
  const action = readString(formData, "action") || "create";
  const payableId = readString(formData, "payableId");
  const permissionAction = action === "create" ? "criar" : action === "pay" ? "aprovar" : "editar";
  const access = await requireCompanyPermission({ module: "financeiro.saidas", action: permissionAction });
  if (!access.ok) {
    if (access.reason === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
    return redirectWith(request, access.reason === "forbidden" ? "forbidden" : "profile_error");
  }
  const { supabase, profile } = access;

  if (action === "stop_series") {
    const seriesId = readString(formData, "seriesId");
    if (!seriesId) return redirectWith(request, "invalid");
    const { data: result, error } = await supabase.rpc("app_stop_fixed_payable_series", {
      target_series_id: seriesId
    });
    if (error || result !== "stopped") {
      return redirectWith(request, result === "stop_already" ? "series_already_stopped" : "series_stop_error");
    }
    await writeCompanyAudit({
      companyId: profile.company_id,
      actorId: profile.id,
      entity: "payable_series",
      entityId: seriesId,
      action: "stop"
    });
    return redirectWith(request, "series_stopped");
  }

  if (["update", "pay"].includes(action)) {
    if (!payableId) return redirectWith(request, "invalid");

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
      await writeCompanyAudit({
        companyId: profile.company_id,
        actorId: profile.id,
        entity: "payable",
        entityId: payable.id,
        action: "pay",
        metadata: { paidAt, paymentMethod }
      });
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
    await writeCompanyAudit({
      companyId: profile.company_id,
      actorId: profile.id,
      entity: "payable",
      entityId: payable.id,
      action: "update"
    });
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
  const scheduleType = readString(formData, "scheduleType") || "single";
  const installmentCountValue = Number.parseInt(readString(formData, "installmentCount"), 10);
  const installmentCount = Number.isInteger(installmentCountValue) ? installmentCountValue : null;

  const invalid =
    !vendorName ||
    !category ||
    !description ||
    !/^\d{4}-\d{2}$/.test(competence) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
    !allowedStatuses.has(status) ||
    !isPayableScheduleType(scheduleType) ||
    amount === null ||
    amount <= 0 ||
    (status === "pago" && (!paidAt || !paymentMethod)) ||
    (scheduleType !== "single" && status === "pago") ||
    (scheduleType === "installment" && (installmentCount === null || installmentCount < 2 || installmentCount > 120));

  if (invalid) return redirectWith(request, "invalid");

  if (scheduleType !== "single") {
    const { data: seriesId, error: scheduleError } = await supabase.rpc("app_create_payable_schedule", {
      target_company_id: profile.company_id,
      target_kind: scheduleType,
      target_vendor_name: vendorName,
      target_category: category,
      target_description: description,
      target_amount: amount,
      target_first_competence: competence,
      target_first_due_date: dueDate,
      target_installment_count: scheduleType === "installment" ? installmentCount : null,
      target_status: status,
      target_notes: readString(formData, "notes") || null
    });
    if (scheduleError || !seriesId) return redirectWith(request, "schedule_error");
    await writeCompanyAudit({
      companyId: profile.company_id,
      actorId: profile.id,
      entity: "payable_series",
      entityId: seriesId,
      action: "create",
      metadata: { scheduleType, installmentCount, amount }
    });
    return redirectWith(request, scheduleType === "installment" ? "installments_created" : "fixed_created");
  }

  const now = new Date().toISOString();
  const { data: created, error } = await supabase.from("payables").insert({
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
  }).select("id").single();

  if (error || !created) return redirectWith(request, "error");

  await writeCompanyAudit({
    companyId: profile.company_id,
    actorId: profile.id,
    entity: "payable",
    entityId: created.id,
    action: "create"
  });

  return redirectWith(request, "created");
}
