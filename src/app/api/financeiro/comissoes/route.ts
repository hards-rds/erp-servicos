import { NextRequest, NextResponse } from "next/server";
import { assertCommissionTransition, calculateCommissionAmount, type CommissionStatus } from "@/domains/finance/commissions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function parseNumber(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/financeiro/comissoes?status=${status}`, request.url), 303);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,company_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.company_id) return redirectWith(request, "profile_error");

  const formData = await request.formData();
  const action = readString(formData, "action");

  if (action === "create") {
    const sellerId = readString(formData, "sellerId");
    const description = readString(formData, "description");
    const referenceDate = readString(formData, "referenceDate");
    const dueDate = readString(formData, "dueDate");
    const baseAmount = parseNumber(readString(formData, "baseAmount"));
    const ratePercent = parseNumber(readString(formData, "ratePercent"));

    if (
      !sellerId || !description ||
      !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
      baseAmount === null || baseAmount <= 0 ||
      ratePercent === null || ratePercent <= 0 || ratePercent > 100
    ) return redirectWith(request, "invalid");

    const { data: seller } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", sellerId)
      .eq("company_id", profile.company_id)
      .eq("active", true)
      .maybeSingle();
    if (!seller) return redirectWith(request, "invalid_seller");

    const { error } = await supabase.from("commissions").insert({
      company_id: profile.company_id,
      seller_id: seller.id,
      source_type: "manual",
      reference_date: referenceDate,
      description,
      base_amount: baseAmount,
      rate_percent: ratePercent,
      commission_amount: calculateCommissionAmount(baseAmount, ratePercent),
      due_date: dueDate,
      status: "pendente",
      notes: readString(formData, "notes") || null,
      created_by: profile.id,
      updated_by: profile.id
    });

    return redirectWith(request, error ? "error" : "created");
  }

  const commissionId = readString(formData, "commissionId");
  if (!commissionId || !["approve", "pay", "cancel"].includes(action)) {
    return redirectWith(request, "invalid");
  }

  const { data: commission } = await supabase
    .from("commissions")
    .select("id,seller_id,description,reference_date,due_date,commission_amount,status,payable_id")
    .eq("id", commissionId)
    .eq("company_id", profile.company_id)
    .maybeSingle();
  if (!commission) return redirectWith(request, "not_found");

  const targetStatus: CommissionStatus = action === "approve" ? "aprovada" : action === "pay" ? "paga" : "cancelada";
  try {
    assertCommissionTransition(commission.status as CommissionStatus, targetStatus);
  } catch {
    return redirectWith(request, "invalid_transition");
  }

  if (action === "approve") {
    const { data: seller } = await supabase
      .from("profiles")
      .select("name,email")
      .eq("id", commission.seller_id)
      .maybeSingle();
    const now = new Date().toISOString();
    const { data: payable, error: payableError } = await supabase.from("payables").insert({
      company_id: profile.company_id,
      vendor_name: seller?.name || seller?.email || "Vendedor",
      category: "Comissoes",
      description: commission.description,
      competence: commission.reference_date.slice(0, 7),
      due_date: commission.due_date,
      amount: commission.commission_amount,
      status: "aprovado",
      notes: `Comissao ${commission.id}`,
      approved_by: profile.id,
      created_by: profile.id,
      updated_by: profile.id,
      created_at: now,
      updated_at: now
    }).select("id").single();
    if (payableError || !payable?.id) return redirectWith(request, "payable_error");

    const { error } = await supabase
      .from("commissions")
      .update({ status: "aprovada", payable_id: payable.id, approved_by: profile.id, updated_by: profile.id, updated_at: now })
      .eq("id", commission.id)
      .eq("company_id", profile.company_id)
      .eq("status", "pendente");

    if (error) {
      await supabase.from("payables").update({ status: "cancelado" }).eq("id", payable.id).eq("company_id", profile.company_id);
      return redirectWith(request, "error");
    }
    return redirectWith(request, "approved");
  }

  if (action === "pay") {
    const paidAt = readString(formData, "paidAt");
    const paymentMethod = readString(formData, "paymentMethod");
    if (!commission.payable_id || !/^\d{4}-\d{2}-\d{2}$/.test(paidAt) || !paymentMethod) {
      return redirectWith(request, "invalid_payment");
    }

    const now = new Date().toISOString();
    const { error: payableError } = await supabase
      .from("payables")
      .update({
        status: "pago",
        paid_at: paidAt,
        payment_method: paymentMethod,
        paid_by: profile.id,
        notes: readString(formData, "paymentNotes")
          ? `Comissao ${commission.id} · ${readString(formData, "paymentNotes")}`
          : `Comissao ${commission.id}`,
        updated_by: profile.id,
        updated_at: now
      })
      .eq("id", commission.payable_id)
      .eq("company_id", profile.company_id)
      .eq("status", "aprovado");
    if (payableError) return redirectWith(request, "payable_error");

    const { error } = await supabase
      .from("commissions")
      .update({
        status: "paga",
        paid_at: paidAt,
        payment_method: paymentMethod,
        paid_by: profile.id,
        updated_by: profile.id,
        updated_at: now
      })
      .eq("id", commission.id)
      .eq("company_id", profile.company_id)
      .eq("status", "aprovada");
    if (error) {
      await supabase
        .from("payables")
        .update({ status: "aprovado", paid_at: null, payment_method: null, paid_by: null })
        .eq("id", commission.payable_id)
        .eq("company_id", profile.company_id);
      return redirectWith(request, "error");
    }
    return redirectWith(request, "paid");
  }

  if (commission.payable_id) {
    await supabase
      .from("payables")
      .update({ status: "cancelado", updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("id", commission.payable_id)
      .eq("company_id", profile.company_id)
      .neq("status", "pago");
  }
  const { error } = await supabase
    .from("commissions")
    .update({ status: "cancelada", updated_by: profile.id, updated_at: new Date().toISOString() })
    .eq("id", commission.id)
    .eq("company_id", profile.company_id);
  return redirectWith(request, error ? "error" : "canceled");
}
