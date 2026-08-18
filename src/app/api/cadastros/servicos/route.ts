import { NextRequest, NextResponse } from "next/server";
import { serviceDeletionBlock } from "@/domains/services/deletion";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { resolveSellerCommissionRate, syncSourceCommission } from "@/server/services/comissoes-service";

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

async function getActiveContext(input: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  userId: string;
}) {
  const { data: profile } = await input.supabase
    .from("profiles")
    .select("id,company_id")
    .eq("id", input.userId)
    .maybeSingle();

  if (!profile?.id) return null;

  let companyId = profile.company_id as string | null;

  if (!companyId) {
    const service = createServiceClient();
    const { data: membership } = await service
      .from("company_members")
      .select("company_id")
      .eq("user_id", profile.id)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    companyId = membership?.company_id || null;

    if (companyId) {
      await service
        .from("profiles")
        .update({ company_id: companyId, updated_at: new Date().toISOString() })
        .eq("id", profile.id);
    }
  }

  if (!companyId) return { profileId: profile.id, companyId: null, segment: "tecnologia" };

  const { data: company } = await input.supabase
    .from("companies")
    .select("service_segment")
    .eq("id", companyId)
    .maybeSingle();

  return {
    profileId: profile.id,
    companyId,
    segment: company?.service_segment || "tecnologia"
  };
}

async function syncReceivableFromService(input: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
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
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  const context = await getActiveContext({ supabase, userId: user.id });

  if (!context?.companyId) {
    return NextResponse.redirect(new URL("/cadastros/servicos?status=profile_error", request.url), 303);
  }

  const formData = await request.formData();
  const action = readString(formData, "action") || "create";
  const segment = context.segment;
  const serviceId = readString(formData, "serviceId");
  const clientId = readString(formData, "clientId");
  const serviceDescription = readString(formData, "serviceDescription");
  const amount = parseMoney(readString(formData, "amount"));
  const sellerId = readString(formData, "sellerId") || null;

  if (action === "delete") {
    if (!serviceId) {
      return NextResponse.redirect(new URL("/cadastros/servicos?status=invalid_delete", request.url), 303);
    }

    const { data: service } = await supabase
      .from("service_records")
      .select("id,status")
      .eq("id", serviceId)
      .eq("company_id", context.companyId)
      .maybeSingle();

    if (!service) {
      return NextResponse.redirect(new URL("/cadastros/servicos?status=delete_not_found", request.url), 303);
    }

    const { data: financialEntry, error: financialEntryError } = await supabase
      .from("financial_entries")
      .select("id")
      .eq("company_id", context.companyId)
      .eq("idempotency_key", `service-record:${serviceId}`)
      .maybeSingle();

    if (financialEntryError) {
      return NextResponse.redirect(new URL("/cadastros/servicos?status=delete_error", request.url), 303);
    }

    const block = serviceDeletionBlock(service.status, Boolean(financialEntry));

    if (block === "service_active") {
      return NextResponse.redirect(new URL("/cadastros/servicos?status=delete_not_stopped", request.url), 303);
    }
    if (block === "financial_entry") {
      return NextResponse.redirect(new URL("/cadastros/servicos?status=delete_financial", request.url), 303);
    }

    const { error } = await supabase
      .from("service_records")
      .delete()
      .eq("id", serviceId)
      .eq("company_id", context.companyId);

    return NextResponse.redirect(
      new URL(`/cadastros/servicos?status=${error ? "delete_error" : "deleted"}`, request.url),
      303
    );
  }

  if (!clientId || !serviceDescription || amount === null || amount < 0) {
    return NextResponse.redirect(new URL("/cadastros/servicos?status=invalid", request.url), 303);
  }

  const payload = {
    client_id: clientId,
    service_description: serviceDescription,
    service_type: readString(formData, "serviceType") || "avulso",
    amount,
    service_date: readString(formData, "serviceDate") || new Date().toISOString().slice(0, 10),
    due_date: readString(formData, "dueDate") || null,
    status: readString(formData, "status") || "rascunho",
    fiscal_service_data: collectSegmentDetails(formData, segment),
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
      return NextResponse.redirect(new URL("/cadastros/servicos?status=commission_rule_missing", request.url), 303);
    }
    commissionRate = commissionRule.ratePercent;
  }

  if (action === "update") {
    if (!serviceId) {
      return NextResponse.redirect(new URL("/cadastros/servicos?status=invalid", request.url), 303);
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
        return NextResponse.redirect(new URL("/cadastros/servicos?status=commission_error", request.url), 303);
      }
    }

    return NextResponse.redirect(new URL(`/cadastros/servicos?status=${error ? "update_error" : "updated"}`, request.url), 303);
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
      return NextResponse.redirect(new URL("/cadastros/servicos?status=commission_error", request.url), 303);
    }
  }

  return NextResponse.redirect(new URL(`/cadastros/servicos?status=${error ? "error" : "created"}`, request.url), 303);
}
