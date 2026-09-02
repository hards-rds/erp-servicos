import { NextRequest, NextResponse } from "next/server";
import { serviceDeletionBlock } from "@/domains/services/deletion";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";
import { resolveSellerCommissionRate, syncSourceCommission } from "@/server/services/comissoes-service";
import { collectIbsCbsServiceData, validateIbsCbsServiceData } from "@/domains/fiscal/ibs-cbs";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function parseMoney(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function getCompetence(value: string) {
  return (value || new Date().toISOString().slice(0, 10)).slice(0, 7);
}

function collectSegmentDetails(formData: FormData, segment: string) {
  if (segment === "otica") {
    return {
      segment,
      lensType: readString(formData, "lensType"),
      frameModel: readString(formData, "frameModel"),
      labName: readString(formData, "labName"),
      deliveryDate: readString(formData, "deliveryDate"),
      rightEye: {
        spherical: readString(formData, "rightEyeSpherical"),
        cylindrical: readString(formData, "rightEyeCylindrical"),
        axis: readString(formData, "rightEyeAxis"),
        addition: readString(formData, "rightEyeAddition")
      },
      leftEye: {
        spherical: readString(formData, "leftEyeSpherical"),
        cylindrical: readString(formData, "leftEyeCylindrical"),
        axis: readString(formData, "leftEyeAxis"),
        addition: readString(formData, "leftEyeAddition")
      },
      dnp: readString(formData, "dnp")
    };
  }

  if (segment === "tecnologia") {
    return {
      segment,
      serviceMode: readString(formData, "serviceMode"),
      priority: readString(formData, "priority"),
      equipment: readString(formData, "equipment"),
      technician: readString(formData, "technician"),
      ticketNumber: readString(formData, "ticketNumber"),
      sla: readString(formData, "sla")
    };
  }

  return { segment };
}

function collectFiscalServiceData(formData: FormData, segment: string) {
  return {
    ...collectSegmentDetails(formData, segment),
    provider: "nfse_nacional",
    serviceCode: readString(formData, "serviceCode"),
    municipalServiceCode: readString(formData, "municipalServiceCode"),
    nbsCode: readString(formData, "nbsCode"),
    retainIss: formData.get("retainIss") === "on",
    ...collectIbsCbsServiceData(formData)
  };
}

function hasValidFiscalCodes(fiscalData: ReturnType<typeof collectFiscalServiceData>) {
  if (fiscalData.serviceCode && !/^\d{6}$/.test(fiscalData.serviceCode)) return false;
  if (fiscalData.nbsCode && !/^\d{9}$/.test(fiscalData.nbsCode)) return false;
  return validateIbsCbsServiceData(fiscalData, false).length === 0;
}

async function syncReceivableFromService(input: {
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createServerSupabaseClient>>;
  companyId: string;
  serviceId: string;
  profileId: string;
  payload: {
    client_id: string;
    service_description: string;
    amount: number;
    service_date: string;
    due_date: string | null;
    status: string;
    notes: string | null;
  };
}) {
  const idempotencyKey = `service-record:${input.serviceId}`;

  if (input.payload.status !== "faturado") {
    await input.supabase
      .from("financial_entries")
      .update({
        status: "cancelado",
        cancel_reason: "Servico deixou de estar faturado.",
        updated_by: input.profileId,
        updated_at: new Date().toISOString()
      })
      .eq("company_id", input.companyId)
      .eq("idempotency_key", idempotencyKey);
    return;
  }

  const dueDate = input.payload.due_date || input.payload.service_date;
  await input.supabase.from("financial_entries").upsert(
    {
      company_id: input.companyId,
      client_id: input.payload.client_id,
      type: "avulsa",
      description: input.payload.service_description,
      competence: getCompetence(input.payload.service_date),
      issued_at: input.payload.service_date,
      due_date: dueDate,
      gross_amount: input.payload.amount,
      discounts: 0,
      interest: 0,
      penalty: 0,
      net_amount: input.payload.amount,
      status: "aguardando_pagamento",
      idempotency_key: idempotencyKey,
      notes: input.payload.notes,
      created_by: input.profileId,
      updated_by: input.profileId,
      updated_at: new Date().toISOString()
    },
    { onConflict: "company_id,idempotency_key" }
  );
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const action = readString(formData, "action") || "create";
  const permissionAction = action === "delete" ? "excluir" : action === "update" ? "editar" : "criar";
  const access = await requireCompanyPermission({ module: "cadastros.servicos", action: permissionAction });
  if (!access.ok) {
    if (access.reason === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
    return NextResponse.redirect(new URL(`/cadastros/servicos?view=atendimentos&status=${access.reason === "forbidden" ? "forbidden" : "profile_error"}`, request.url), 303);
  }
  const { supabase, profile, company } = access;
  const context = { profileId: profile.id, companyId: profile.company_id, segment: company.service_segment };
  const segment = context.segment;
  const serviceId = readString(formData, "serviceId");
  const clientId = readString(formData, "clientId");
  const serviceDescription = readString(formData, "serviceDescription");
  const amount = parseMoney(readString(formData, "amount"));
  const sellerId = readString(formData, "sellerId") || null;

  if (action === "delete") {
    if (!serviceId) {
      return NextResponse.redirect(new URL("/cadastros/servicos?view=atendimentos&status=invalid_delete", request.url), 303);
    }

    const { data: service } = await supabase
      .from("service_records")
      .select("id,status")
      .eq("id", serviceId)
      .eq("company_id", context.companyId)
      .maybeSingle();

    if (!service) {
      return NextResponse.redirect(new URL("/cadastros/servicos?view=atendimentos&status=delete_not_found", request.url), 303);
    }

    const { data: financialEntry, error: financialEntryError } = await supabase
      .from("financial_entries")
      .select("id")
      .eq("company_id", context.companyId)
      .eq("idempotency_key", `service-record:${serviceId}`)
      .maybeSingle();

    if (financialEntryError) {
      return NextResponse.redirect(new URL("/cadastros/servicos?view=atendimentos&status=delete_error", request.url), 303);
    }

    const block = serviceDeletionBlock(service.status, Boolean(financialEntry));

    if (block === "service_active") {
      return NextResponse.redirect(new URL("/cadastros/servicos?view=atendimentos&status=delete_not_stopped", request.url), 303);
    }
    if (block === "financial_entry") {
      return NextResponse.redirect(new URL("/cadastros/servicos?view=atendimentos&status=delete_financial", request.url), 303);
    }

    const { error } = await supabase
      .from("service_records")
      .delete()
      .eq("id", serviceId)
      .eq("company_id", context.companyId);

    if (!error) await writeCompanyAudit({ companyId: context.companyId, actorId: context.profileId, entity: "service_record", entityId: serviceId, action: "delete" });
    return NextResponse.redirect(
      new URL(`/cadastros/servicos?view=atendimentos&status=${error ? "delete_error" : "deleted"}`, request.url),
      303
    );
  }

  if (!clientId || !serviceDescription || amount === null || amount < 0) {
    return NextResponse.redirect(new URL("/cadastros/servicos?view=atendimentos&status=invalid", request.url), 303);
  }

  const fiscalServiceData = collectFiscalServiceData(formData, segment);
  if (!hasValidFiscalCodes(fiscalServiceData)) {
    return NextResponse.redirect(new URL("/cadastros/servicos?view=atendimentos&status=fiscal_invalid", request.url), 303);
  }

  const payload = {
    client_id: clientId,
    service_description: serviceDescription,
    service_type: readString(formData, "serviceType") || "avulso",
    amount,
    service_date: readString(formData, "serviceDate") || new Date().toISOString().slice(0, 10),
    due_date: readString(formData, "dueDate") || null,
    status: readString(formData, "status") || "rascunho",
    fiscal_service_data: fiscalServiceData,
    notes: readString(formData, "notes") || null,
    updated_by: context.profileId,
    updated_at: new Date().toISOString()
  };

  let commissionRate: number | null = null;
  if (sellerId && payload.status !== "cancelado") {
    const commissionRule = await resolveSellerCommissionRate({
      supabase,
      companyId: context.companyId,
      sellerId,
      sourceType: "servico",
      itemKey: payload.service_type
    });
    if (commissionRule.error || commissionRule.ratePercent === null) {
      return NextResponse.redirect(new URL("/cadastros/servicos?view=atendimentos&status=commission_rule_missing", request.url), 303);
    }
    commissionRate = commissionRule.ratePercent;
  }

  if (action === "update") {
    if (!serviceId) {
      return NextResponse.redirect(new URL("/cadastros/servicos?view=atendimentos&status=invalid", request.url), 303);
    }

    const { error } = await supabase
      .from("service_records")
      .update(payload)
      .eq("id", serviceId)
      .eq("company_id", context.companyId);

    if (!error) {
      await syncReceivableFromService({
        supabase,
        companyId: context.companyId,
        serviceId,
        profileId: context.profileId,
        payload
      });
      const commissionResult = await syncSourceCommission({
        supabase,
        companyId: context.companyId,
        profileId: context.profileId,
        sellerId,
        sourceType: "servico",
        sourceId: serviceId,
        referenceDate: payload.service_date,
        description: `Comissao - ${payload.service_description}`,
        baseAmount: payload.amount,
        ratePercent: commissionRate,
        dueDate: readString(formData, "commissionDueDate") || payload.due_date || payload.service_date,
        canceled: payload.status === "cancelado"
      });
      if (commissionResult.error) {
        return NextResponse.redirect(new URL("/cadastros/servicos?view=atendimentos&status=commission_error", request.url), 303);
      }
      await writeCompanyAudit({ companyId: context.companyId, actorId: context.profileId, entity: "service_record", entityId: serviceId, action: "update", metadata: { status: payload.status, amount: payload.amount } });
    }

    return NextResponse.redirect(new URL(`/cadastros/servicos?view=atendimentos&status=${error ? "update_error" : "updated"}`, request.url), 303);
  }

  const { data: createdService, error } = await supabase.from("service_records").insert({
    ...payload,
    company_id: context.companyId,
    created_by: context.profileId
  }).select("id").single();

  if (!error && createdService?.id) {
    await syncReceivableFromService({
      supabase,
      companyId: context.companyId,
      serviceId: createdService.id,
      profileId: context.profileId,
      payload
    });
    const commissionResult = await syncSourceCommission({
      supabase,
      companyId: context.companyId,
      profileId: context.profileId,
      sellerId,
      sourceType: "servico",
      sourceId: createdService.id,
      referenceDate: payload.service_date,
      description: `Comissao - ${payload.service_description}`,
      baseAmount: payload.amount,
      ratePercent: commissionRate,
      dueDate: readString(formData, "commissionDueDate") || payload.due_date || payload.service_date,
      canceled: payload.status === "cancelado"
    });
    if (commissionResult.error) {
      return NextResponse.redirect(new URL("/cadastros/servicos?view=atendimentos&status=commission_error", request.url), 303);
    }
    await writeCompanyAudit({ companyId: context.companyId, actorId: context.profileId, entity: "service_record", entityId: createdService.id, action: "create", metadata: { status: payload.status, amount: payload.amount } });
  }

  return NextResponse.redirect(new URL(`/cadastros/servicos?view=atendimentos&status=${error ? "error" : "created"}`, request.url), 303);
}
