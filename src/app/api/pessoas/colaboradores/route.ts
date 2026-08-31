import { NextRequest, NextResponse } from "next/server";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";
import { isValidCnpj, onlyDigits } from "@/lib/validations/br-documents";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function parseMoney(value: string) {
  const compact = value.replace(/\s/g, "");
  const normalized = compact.includes(",") ? compact.replace(/\./g, "").replace(",", ".") : compact;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function redirectTo(request: NextRequest, path: string, status: string, extra?: Record<string, string | number>) {
  const url = new URL(path, request.url);
  url.searchParams.set("status", status);
  for (const [key, value] of Object.entries(extra || {})) url.searchParams.set(key, String(value));
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const action = readString(formData, "action") || "create";
  const permissionAction = action === "approve" ? "aprovar" : action === "cancel" ? "cancelar" : action === "update" || action === "adjust" ? "editar" : "criar";
  const access = await requireCompanyPermission({ module: "pessoas.colaboradores", action: permissionAction });
  if (!access.ok) {
    if (access.reason === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
    return redirectTo(request, "/pessoas/colaboradores", access.reason === "forbidden" ? "forbidden" : "profile_error");
  }
  const { supabase, profile } = access;

  if (action === "generate_all") {
    const competence = readString(formData, "competence");
    if (!/^\d{4}-\d{2}$/.test(competence)) return redirectTo(request, "/pessoas/fechamentos", "invalid");
    const start = `${competence}-01`;
    const monthEnd = new Date(`${competence}-01T12:00:00Z`);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
    const end = monthEnd.toISOString().slice(0, 10);
    const { data: contractors, error } = await supabase
      .from("contractors")
      .select("id")
      .eq("company_id", profile.company_id)
      .eq("active", true)
      .lte("starts_at", end)
      .or(`ends_at.is.null,ends_at.gte.${start}`);
    if (error) return redirectTo(request, "/pessoas/fechamentos", "generate_error", { competence });

    let generated = 0;
    let locked = 0;
    let failed = 0;
    for (const contractor of contractors || []) {
      const { error: generateError } = await supabase.rpc("app_generate_contractor_compensation", {
        target_contractor_id: contractor.id,
        target_competence: competence
      });
      if (!generateError) generated += 1;
      else if (String(generateError.message).includes("contractor_compensation_locked")) locked += 1;
      else failed += 1;
    }
    await writeCompanyAudit({
      companyId: profile.company_id,
      actorId: profile.id,
      entity: "contractor_compensation",
      action: "generate_competence",
      metadata: { competence, generated, locked, failed }
    });
    return redirectTo(
      request,
      "/pessoas/fechamentos",
      failed ? "generate_error" : generated ? "generated" : locked ? "locked" : "empty",
      { competence, generated }
    );
  }

  const compensationId = readString(formData, "compensationId");
  if (action === "approve") {
    if (!compensationId) return redirectTo(request, "/pessoas/fechamentos", "invalid");
    const { data: payableId, error } = await supabase.rpc("app_approve_contractor_compensation", {
      target_compensation_id: compensationId
    });
    if (error || !payableId) return redirectTo(request, `/pessoas/fechamentos/${compensationId}`, "approve_error");
    await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "contractor_compensation", entityId: compensationId, action: "approve", metadata: { payableId } });
    return redirectTo(request, `/pessoas/fechamentos/${compensationId}`, "approved");
  }

  if (action === "cancel") {
    if (!compensationId) return redirectTo(request, "/pessoas/fechamentos", "invalid");
    const { data: result, error } = await supabase.rpc("app_cancel_contractor_compensation", {
      target_compensation_id: compensationId
    });
    if (error || result !== "cancelled") return redirectTo(request, `/pessoas/fechamentos/${compensationId}`, result === "paid" || result === "reconciled" ? "settled" : "cancel_error");
    await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "contractor_compensation", entityId: compensationId, action: "cancel" });
    return redirectTo(request, "/pessoas/fechamentos", "cancelled");
  }

  if (action === "adjust") {
    const adjustments = parseMoney(readString(formData, "adjustments"));
    const notes = readString(formData, "notes");
    if (!compensationId || adjustments === null) return redirectTo(request, `/pessoas/fechamentos/${compensationId}`, "invalid");
    const { data: current } = await supabase
      .from("contractor_compensations")
      .select("fixed_amount,cost_allowance_amount,commission_amount,status")
      .eq("id", compensationId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (!current || current.status !== "rascunho") return redirectTo(request, `/pessoas/fechamentos/${compensationId}`, "locked");
    const total = Number(current.fixed_amount) + Number(current.cost_allowance_amount) + Number(current.commission_amount) + adjustments;
    if (total < 0) return redirectTo(request, `/pessoas/fechamentos/${compensationId}`, "invalid");
    const { error } = await supabase.from("contractor_compensations").update({
      adjustments,
      total_amount: total,
      notes: notes || null,
      updated_by: profile.id,
      updated_at: new Date().toISOString()
    }).eq("id", compensationId).eq("company_id", profile.company_id).eq("status", "rascunho");
    if (error) return redirectTo(request, `/pessoas/fechamentos/${compensationId}`, "adjust_error");
    await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "contractor_compensation", entityId: compensationId, action: "adjust", metadata: { adjustments } });
    return redirectTo(request, `/pessoas/fechamentos/${compensationId}`, "adjusted");
  }

  const contractorId = readString(formData, "contractorId");
  const legalName = readString(formData, "legalName");
  const taxId = onlyDigits(readString(formData, "taxId"));
  const fixedAmount = parseMoney(readString(formData, "fixedMonthlyAmount"));
  const costAllowance = parseMoney(readString(formData, "costAllowanceAmount"));
  const commissionRate = parseMoney(readString(formData, "commissionRate"));
  const dueDay = Number(readString(formData, "dueDay"));
  const startsAt = readString(formData, "startsAt");
  const endsAt = readString(formData, "endsAt");
  const commissionBasis = readString(formData, "commissionBasis");
  const invalid = !legalName || !isValidCnpj(taxId) || !readString(formData, "roleTitle")
    || fixedAmount === null || fixedAmount < 0 || costAllowance === null || costAllowance < 0
    || commissionRate === null || commissionRate < 0 || commissionRate > 100
    || !["contracted", "received"].includes(commissionBasis)
    || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31
    || !/^\d{4}-\d{2}-\d{2}$/.test(startsAt)
    || (endsAt && (!/^\d{4}-\d{2}-\d{2}$/.test(endsAt) || endsAt < startsAt));
  if (invalid) return redirectTo(request, action === "update" && contractorId ? `/pessoas/colaboradores/${contractorId}/editar` : "/pessoas/colaboradores/novo", "invalid");

  const payload = {
    legal_name: legalName,
    trade_name: readString(formData, "tradeName") || null,
    tax_id: taxId,
    role_title: readString(formData, "roleTitle"),
    email: readString(formData, "email") || null,
    phone: readString(formData, "phone") || null,
    pix_key: readString(formData, "pixKey") || null,
    fixed_monthly_amount: fixedAmount,
    cost_allowance_amount: costAllowance,
    commission_rate: commissionRate,
    commission_basis: commissionBasis,
    due_day: dueDay,
    starts_at: startsAt,
    ends_at: endsAt || null,
    active: formData.get("active") === "on",
    notes: readString(formData, "notes") || null,
    updated_by: profile.id,
    updated_at: new Date().toISOString()
  };

  if (action === "update") {
    if (!contractorId) return redirectTo(request, "/pessoas/colaboradores", "invalid");
    const { error } = await supabase.from("contractors").update(payload).eq("id", contractorId).eq("company_id", profile.company_id);
    if (!error) await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "contractor", entityId: contractorId, action: "update" });
    return redirectTo(request, error ? `/pessoas/colaboradores/${contractorId}/editar` : "/pessoas/colaboradores", error ? "error" : "updated");
  }

  if (action !== "create") return redirectTo(request, "/pessoas/colaboradores", "invalid");
  const { data: created, error } = await supabase.from("contractors").insert({
    company_id: profile.company_id,
    ...payload,
    created_by: profile.id
  }).select("id").single();
  if (!error && created) await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "contractor", entityId: created.id, action: "create" });
  return redirectTo(request, "/pessoas/colaboradores", error ? "error" : "created");
}
