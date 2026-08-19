import { NextRequest, NextResponse } from "next/server";
import { competenceFromDate, dueDateForCompetence } from "@/lib/dates/competence";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { processInterCharge } from "@/server/services/inter-charge-service";

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

function redirectToNfse(request: NextRequest, documentId: string) {
  const target = new URL("/fiscal/emissao-nfse", request.url);
  target.searchParams.set("status", "queued");
  target.searchParams.set("documentId", documentId);
  return NextResponse.redirect(target, 303);
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

type ContractFlowInput = {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  companyId: string;
  profileId: string;
  contractId: string;
  clientId: string;
  description: string;
  amount: number;
  dueDay: number;
};

async function ensureContractEntry(input: ContractFlowInput) {
  const competence = competenceFromDate(new Date());
  const dueDate = dueDateForCompetence(competence, input.dueDay);
  const entryKey = `contract:${input.contractId}:competence:${competence}:due:${dueDate}`;

  const { data: existing } = await input.supabase
    .from("financial_entries")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("idempotency_key", entryKey)
    .maybeSingle();
  if (existing?.id) return { entryId: existing.id, competence, dueDate };

  const { data: entry, error: entryError } = await input.supabase
    .from("financial_entries").insert({
      company_id: input.companyId,
      client_id: input.clientId,
      contract_id: input.contractId,
      type: "recorrente",
      description: input.description,
      competence,
      due_date: dueDate,
      gross_amount: input.amount,
      discounts: 0,
      interest: 0,
      penalty: 0,
      net_amount: input.amount,
      status: "previsto",
      idempotency_key: entryKey,
      notes: "Gerado automaticamente a partir de contrato recorrente.",
      created_by: input.profileId,
      updated_by: input.profileId
    }).select("id").single();

  if (!entryError && entry?.id) return { entryId: entry.id, competence, dueDate };

  const { data: concurrentEntry } = await input.supabase
    .from("financial_entries")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("idempotency_key", entryKey)
    .maybeSingle();
  return concurrentEntry?.id ? { entryId: concurrentEntry.id, competence, dueDate } : null;
}

async function ensureContractNfse(input: ContractFlowInput, entry: NonNullable<Awaited<ReturnType<typeof ensureContractEntry>>>) {
  const nfseKey = `nfse:${entry.entryId}:${entry.competence}`;
  const { data: existing } = await input.supabase
    .from("nfse_documents")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("idempotency_key", nfseKey)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: document, error } = await input.supabase.from("nfse_documents").insert({
    company_id: input.companyId,
    client_id: input.clientId,
    financial_entry_id: entry.entryId,
    status: "enfileirada",
    competence: entry.competence,
    service_amount: input.amount,
    idempotency_key: nfseKey,
    request_payload: {
      source: "contract_recurrence",
      contractId: input.contractId,
      financialEntryId: entry.entryId
    }
  }).select("id").single();
  if (!error && document?.id) return document.id;

  const { data: concurrentDocument } = await input.supabase
    .from("nfse_documents")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("idempotency_key", nfseKey)
    .maybeSingle();
  return concurrentDocument?.id || null;
}

async function ensureContractCharge(input: ContractFlowInput, entry: NonNullable<Awaited<ReturnType<typeof ensureContractEntry>>>) {
  const chargeKey = `inter-charge:${entry.entryId}:${entry.dueDate}`;
  const { data: existing } = await input.supabase
    .from("boleto_charges")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("idempotency_key", chargeKey)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: charge, error } = await input.supabase.from("boleto_charges").insert({
    company_id: input.companyId,
    financial_entry_id: entry.entryId,
    status: "rascunho",
    idempotency_key: chargeKey,
    request_payload: {
      source: "contract_recurrence",
      contractId: input.contractId,
      financialEntryId: entry.entryId,
      dueDate: entry.dueDate,
      amount: input.amount
    }
  }).select("id").single();
  if (!error && charge?.id) return charge.id;

  const { data: concurrentCharge } = await input.supabase
    .from("boleto_charges")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("idempotency_key", chargeKey)
    .maybeSingle();
  return concurrentCharge?.id || null;
}

async function loadContractForAction(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  companyId: string,
  contractId: string
) {
  const { data } = await supabase
    .from("contracts")
    .select("id,client_id,service_description,recurring_amount,due_day,status,fiscal_service_data")
    .eq("id", contractId)
    .eq("company_id", companyId)
    .maybeSingle();
  return data;
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

  if (["issue_nfse", "issue_charge"].includes(action)) {
    if (!contractId) return redirectWith(request, "invalid");
    const contract = await loadContractForAction(supabase, profile.company_id, contractId);
    if (!contract || contract.status !== "ativo") return redirectWith(request, "inactive");

    if (action === "issue_charge") {
      const service = createServiceClient();
      const { data: interCredential } = await service
        .from("api_credentials")
        .select("id")
        .eq("company_id", profile.company_id)
        .eq("provider", "banco_inter")
        .eq("active", true)
        .maybeSingle();
      if (!interCredential) return redirectWith(request, "inter_inactive");
    }

    if (action === "issue_nfse") {
      const fiscalData = contract.fiscal_service_data && typeof contract.fiscal_service_data === "object"
        ? contract.fiscal_service_data as Record<string, unknown>
        : {};
      const serviceCode = String(fiscalData.serviceCode || "");
      const nbsCode = String(fiscalData.nbsCode || "");
      if (!/^\d{6}$/.test(serviceCode) || (nbsCode && !/^\d{9}$/.test(nbsCode))) {
        return redirectWith(request, "fiscal_invalid");
      }
    }

    const input: ContractFlowInput = {
      supabase,
      companyId: profile.company_id,
      profileId: profile.id,
      contractId: contract.id,
      clientId: contract.client_id,
      description: contract.service_description,
      amount: Number(contract.recurring_amount),
      dueDay: Number(contract.due_day)
    };
    const entry = await ensureContractEntry(input);
    if (!entry) return redirectWith(request, "generate_error");

    if (action === "issue_nfse") {
      const documentId = await ensureContractNfse(input, entry);
      return documentId ? redirectToNfse(request, documentId) : redirectWith(request, "generate_error");
    }

    const chargeId = await ensureContractCharge(input, entry);
    if (!chargeId) return redirectWith(request, "generate_error");
    const interResult = await processInterCharge(profile.company_id, chargeId, profile.id);
    return redirectWith(request, interResult.ok ? "charge_issued" : "charge_error");
  }

  const clientId = readString(formData, "clientId");
  const serviceDescription = readString(formData, "serviceDescription");
  const amount = parseMoney(readString(formData, "recurringAmount"));
  const dueDay = Number(readString(formData, "dueDay"));
  const fiscalServiceData = collectFiscalServiceData(formData);

  if (!clientId || !serviceDescription || amount === null || amount <= 0 || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    return redirectWith(request, "invalid");
  }

  if (!hasValidNfseCodes(fiscalServiceData, true)) {
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
    auto_issue_nfse: false,
    auto_generate_charge: false,
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

  const { error } = await supabase
    .from("contracts")
    .insert({
      company_id: profile.company_id,
      ...contractPayload,
      created_by: profile.id,
    });

  return redirectWith(request, error ? "error" : "created");
}
