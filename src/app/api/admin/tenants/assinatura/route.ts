import { NextRequest, NextResponse } from "next/server";
import { isPlanCode } from "@/domains/billing/saas-plans";
import { writeCompanyAudit } from "@/lib/auth/api-access";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function redirectWith(request: NextRequest, tenantId: string, status: string) {
  return NextResponse.redirect(new URL(`/admin/tenants/${tenantId}/assinatura?status=${status}`, request.url), 303);
}

function value(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function money(raw: string) {
  if (!raw) return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function timestamp(raw: string) {
  return raw ? new Date(`${raw}T12:00:00.000Z`).toISOString() : null;
}

async function requireSystemAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("id,role,active").eq("id", user.id).maybeSingle();
  return profile?.role === "system_admin" && profile.active !== false ? { actorId: user.id } : null;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const tenantId = value(formData, "tenantId");
  if (!tenantId) return NextResponse.redirect(new URL("/admin/tenants?status=update_invalid", request.url), 303);
  const access = await requireSystemAdmin();
  if (!access) return redirectWith(request, tenantId, "forbidden");

  const action = value(formData, "action");
  const service = createServiceClient();
  const { data: tenant } = await service.from("tenants").select("id,companies(id)").eq("id", tenantId).maybeSingle();
  if (!tenant) return redirectWith(request, tenantId, "not_found");
  const companyId = tenant.companies?.[0]?.id;

  if (action === "update_subscription") {
    const planCode = value(formData, "planCode");
    const subscriptionStatus = value(formData, "subscriptionStatus");
    const billingCycle = value(formData, "billingCycle");
    const amountRaw = value(formData, "amount");
    const parsedAmount = money(amountRaw);
    if (!isPlanCode(planCode) || !["trialing", "active", "past_due", "suspended", "cancelled"].includes(subscriptionStatus) || !["monthly", "annual", "manual"].includes(billingCycle) || (amountRaw && parsedAmount === null)) {
      return redirectWith(request, tenantId, "invalid");
    }
    const tenantStatus = subscriptionStatus === "trialing" ? "trial" : subscriptionStatus === "cancelled" ? "cancelled" : subscriptionStatus === "suspended" ? "suspended" : "active";
    const now = new Date().toISOString();
    const { error: tenantError } = await service.from("tenants").update({ plan: planCode, status: tenantStatus, updated_at: now }).eq("id", tenantId);
    if (tenantError) return redirectWith(request, tenantId, "error");
    const { error } = await service.from("tenant_subscriptions").upsert({
      tenant_id: tenantId,
      plan_code: planCode,
      status: subscriptionStatus,
      billing_cycle: billingCycle,
      amount: parsedAmount,
      trial_ends_at: timestamp(value(formData, "trialEndsAt")),
      current_period_starts_at: timestamp(value(formData, "periodStartsAt")),
      current_period_ends_at: timestamp(value(formData, "periodEndsAt")),
      cancel_at_period_end: formData.get("cancelAtPeriodEnd") === "on",
      updated_at: now
    }, { onConflict: "tenant_id" });
    if (!error && companyId) await writeCompanyAudit({ companyId, actorId: access.actorId, entity: "tenant_subscription", entityId: tenantId, action: "update", metadata: { planCode, subscriptionStatus, billingCycle } });
    return redirectWith(request, tenantId, error ? "error" : "saved");
  }

  if (action === "create_invoice") {
    const reference = value(formData, "reference");
    const dueDate = value(formData, "dueDate");
    const parsedAmount = money(value(formData, "amount"));
    if (!reference || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || parsedAmount === null) return redirectWith(request, tenantId, "invalid");
    const { data: invoice, error } = await service.from("saas_invoices").insert({
      tenant_id: tenantId,
      reference,
      description: value(formData, "description") || null,
      amount: parsedAmount,
      due_date: dueDate,
      status: "pending",
      external_url: value(formData, "externalUrl") || null
    }).select("id").single();
    if (!error && invoice && companyId) await writeCompanyAudit({ companyId, actorId: access.actorId, entity: "saas_invoice", entityId: invoice.id, action: "create", metadata: { reference, amount: parsedAmount, dueDate } });
    return redirectWith(request, tenantId, error ? "error" : "invoice_created");
  }

  if (action === "update_invoice") {
    const invoiceId = value(formData, "invoiceId");
    const invoiceStatus = value(formData, "invoiceStatus");
    if (!invoiceId || !["paid", "cancelled"].includes(invoiceStatus)) return redirectWith(request, tenantId, "invalid");
    const { data: invoice, error } = await service.from("saas_invoices").update({
      status: invoiceStatus,
      paid_at: invoiceStatus === "paid" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    }).eq("id", invoiceId).eq("tenant_id", tenantId).select("id").maybeSingle();
    if (!error && invoice && companyId) await writeCompanyAudit({ companyId, actorId: access.actorId, entity: "saas_invoice", entityId: invoiceId, action: invoiceStatus });
    return redirectWith(request, tenantId, error || !invoice ? "error" : "invoice_updated");
  }

  return redirectWith(request, tenantId, "invalid");
}
