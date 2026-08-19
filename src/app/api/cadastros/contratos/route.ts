import { NextRequest, NextResponse } from "next/server";
import { competenceFromDate, dueDateForCompetence } from "@/lib/dates/competence";
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
  return NextResponse.redirect(new URL(`/cadastros/contratos?status=${status}`, request.url), 303);
}

function collectFiscalServiceData(formData: FormData) {
  return {
    provider: "nfse_nacional",
    serviceCode: readString(formData, "serviceCode"),
    municipalServiceCode: readString(formData, "municipalServiceCode"),
    nbsCode: readString(formData, "nbsCode"),
    retainIss: formData.get("retainIss") === "on"
  };
}

function hasValidNfseCodes(fiscalData: ReturnType<typeof collectFiscalServiceData>, requireServiceCode: boolean) {
  if (requireServiceCode && !/^\d{6}$/.test(fiscalData.serviceCode)) return false;
  if (fiscalData.serviceCode && !/^\d{6}$/.test(fiscalData.serviceCode)) return false;
  return !fiscalData.nbsCode || /^\d{9}$/.test(fiscalData.nbsCode);
}

async function generateContractFlow(input: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  companyId: string;
  profileId: string;
  contractId: string;
  clientId: string;
  description: string;
  amount: number;
  dueDay: number;
  autoIssueNfse: boolean;
  autoGenerateCharge: boolean;
}) {
  const competence = competenceFromDate(new Date());
  const dueDate = dueDateForCompetence(competence, input.dueDay);
  const entryKey = `contract:${input.contractId}:competence:${competence}:due:${dueDate}`;

  const { data: entry, error: entryError } = await input.supabase
    .from("financial_entries")
    .upsert(
      {
        company_id: input.companyId,
        client_id: input.clientId,
        contract_id: input.contractId,
        type: "recorrente",
        description: input.description,
        competence,
        issued_at: new Date().toISOString().slice(0, 10),
        due_date: dueDate,
        gross_amount: input.amount,
        discounts: 0,
        interest: 0,
        penalty: 0,
        net_amount: input.amount,
        status: input.autoGenerateCharge ? "aguardando_pagamento" : "previsto",
        idempotency_key: entryKey,
      notes: "Gerado automaticamente a partir de contrato recorrente.",
        created_by: input.profileId,
        updated_by: input.profileId,
        updated_at: new Date().toISOString()
      },
      { onConflict: "company_id,idempotency_key" }
    )
    .select("id")
    .single();

  if (entryError || !entry?.id) return false;

  if (input.autoIssueNfse) {
    const nfseKey = `nfse:${entry.id}:${competence}`;
    await input.supabase.from("nfse_documents").upsert(
      {
        company_id: input.companyId,
        client_id: input.clientId,
        financial_entry_id: entry.id,
        status: "enfileirada",
        competence,
        service_amount: input.amount,
        idempotency_key: nfseKey,
        request_payload: {
          source: "contract_recurrence",
          contractId: input.contractId,
          financialEntryId: entry.id
        },
        updated_at: new Date().toISOString()
      },
      { onConflict: "company_id,idempotency_key" }
    );
  }

  if (input.autoGenerateCharge) {
    const chargeKey = `inter-charge:${entry.id}:${dueDate}`;
    await input.supabase.from("boleto_charges").upsert(
      {
        company_id: input.companyId,
        financial_entry_id: entry.id,
        status: "solicitada",
        idempotency_key: chargeKey,
        request_payload: {
          source: "contract_recurrence",
          contractId: input.contractId,
          financialEntryId: entry.id,
          dueDate,
          amount: input.amount
        },
        response_payload: {
          provider: "inter-sandbox-mock",
          status: "solicitada"
        },
        updated_at: new Date().toISOString()
      },
      { onConflict: "company_id,idempotency_key" }
    );
  }

  return true;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,company_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.company_id) return redirectWith(request, "profile_error");

  const formData = await request.formData();
  const action = readString(formData, "action") || "create";
  const contractId = readString(formData, "contractId");
  const clientId = readString(formData, "clientId");
  const serviceDescription = readString(formData, "serviceDescription");
  const amount = parseMoney(readString(formData, "recurringAmount"));
  const dueDay = Number(readString(formData, "dueDay"));
  const autoIssueNfse = formData.get("autoIssueNfse") === "on";
  const autoGenerateCharge = formData.get("autoGenerateCharge") === "on";
  const fiscalServiceData = collectFiscalServiceData(formData);

  if (action === "generate") {
    if (!contractId) return redirectWith(request, "invalid");

    const { data: contract } = await supabase
      .from("contracts")
      .select("id,client_id,service_description,recurring_amount,due_day,auto_issue_nfse,auto_generate_charge,status")
      .eq("id", contractId)
      .eq("company_id", profile.company_id)
      .maybeSingle();

    if (!contract || contract.status !== "ativo") return redirectWith(request, "inactive");

    const ok = await generateContractFlow({
      supabase,
      companyId: profile.company_id,
      profileId: profile.id,
      contractId: contract.id,
      clientId: contract.client_id,
      description: contract.service_description,
      amount: Number(contract.recurring_amount),
      dueDay: Number(contract.due_day),
      autoIssueNfse: Boolean(contract.auto_issue_nfse),
      autoGenerateCharge: Boolean(contract.auto_generate_charge)
    });

    return redirectWith(request, ok ? "generated" : "generate_error");
  }

  if (!clientId || !serviceDescription || amount === null || amount <= 0 || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    return redirectWith(request, "invalid");
  }

  if (!hasValidNfseCodes(fiscalServiceData, autoIssueNfse)) {
    return redirectWith(request, "fiscal_invalid");
  }

  const contractPayload = {
    client_id: clientId,
    service_description: serviceDescription,
    recurring_amount: amount,
    periodicity: readString(formData, "periodicity") || "mensal",
    due_day: dueDay,
    starts_at: readString(formData, "startsAt") || new Date().toISOString().slice(0, 10),
    status: readString(formData, "status") || "ativo",
    auto_issue_nfse: autoIssueNfse,
    auto_generate_charge: autoGenerateCharge,
    fiscal_service_data: fiscalServiceData,
    notes: readString(formData, "notes") || null,
    updated_by: profile.id,
    updated_at: new Date().toISOString()
  };

  if (action === "update") {
    if (!contractId) return redirectWith(request, "invalid");

    const { error } = await supabase
      .from("contracts")
      .update(contractPayload)
      .eq("id", contractId)
      .eq("company_id", profile.company_id);

    return redirectWith(request, error ? "error" : "updated");
  }

  const { data: contract, error } = await supabase
    .from("contracts")
    .insert({
      company_id: profile.company_id,
      ...contractPayload,
      created_by: profile.id,
    })
    .select("id,status")
    .single();

  if (error || !contract?.id) return redirectWith(request, "error");

  if (contract.status === "ativo") {
    const ok = await generateContractFlow({
      supabase,
      companyId: profile.company_id,
      profileId: profile.id,
      contractId: contract.id,
      clientId,
      description: serviceDescription,
      amount,
      dueDay,
      autoIssueNfse,
      autoGenerateCharge
    });
    return redirectWith(request, ok ? "created_generated" : "created_flow_error");
  }

  return redirectWith(request, "created");
}
