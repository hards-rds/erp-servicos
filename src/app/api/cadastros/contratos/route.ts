import { NextRequest, NextResponse } from "next/server";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";
import { competenceFromDate } from "@/lib/dates/competence";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import {
  ensureContractCharge,
  ensureContractEntry,
  ensureContractNfse,
  type ContractFlowInput
} from "@/server/services/contract-recurring-flow";
import { processInterCharge } from "@/server/services/inter-charge-service";
import { isPlanLimitError } from "@/domains/billing/saas-plans";
import { canCreateTenantResource, tenantHasFeature } from "@/server/services/saas-plan-service";

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
  const formData = await request.formData();
  const action = readString(formData, "action") || "create";
  const contractId = readString(formData, "contractId");
  const permission = action === "issue_nfse"
    ? { module: "fiscal.nfse", action: "emitir" as const }
    : action === "issue_charge"
      ? { module: "financeiro.cobrancas", action: "emitir" as const }
      : action === "generate_financial"
        ? { module: "financeiro.entradas", action: "criar" as const }
        : { module: "cadastros.contratos", action: action === "update" ? "editar" as const : "criar" as const };
  const access = await requireCompanyPermission(permission);
  if (!access.ok) {
    if (access.reason === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
    return redirectWith(request, access.reason === "forbidden" ? "forbidden" : "profile_error");
  }
  const { supabase, profile } = access;

  if (["generate_financial", "issue_nfse", "issue_charge"].includes(action)) {
    if (!contractId) return redirectWith(request, "invalid");
    const contract = await loadContractForAction(supabase, profile.company_id, contractId);
    if (!contract || contract.status !== "ativo") return redirectWith(request, "inactive");

    if (action === "issue_charge") {
      if (!(await tenantHasFeature(profile.tenant_id, "api_integrations"))) return redirectWith(request, "feature_unavailable");
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
      actorId: profile.id,
      contractId: contract.id,
      clientId: contract.client_id,
      description: contract.service_description,
      amount: Number(contract.recurring_amount),
      dueDay: Number(contract.due_day)
    };
    if (action === "issue_nfse") {
      const fiscalData = contract.fiscal_service_data && typeof contract.fiscal_service_data === "object"
        ? contract.fiscal_service_data as Record<string, unknown>
        : {};
      const competence = competenceFromDate(new Date());
      const entry = await ensureContractEntry(input, competence);
      if (!entry) return redirectWith(request, "generate_error");
      const documentId = await ensureContractNfse(input, entry, fiscalData);
      if (documentId) await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "contract", entityId: contract.id, action: "queue_nfse", metadata: { documentId } });
      return documentId ? redirectToNfse(request, documentId) : redirectWith(request, "generate_error");
    }

    const entry = await ensureContractEntry(input, competenceFromDate(new Date()));
    if (!entry) return redirectWith(request, "generate_error");
    if (action === "generate_financial") {
      await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "contract", entityId: contract.id, action: "generate_financial", metadata: { entryId: entry.entryId } });
      return redirectWith(request, "financial_generated");
    }

    const chargeId = await ensureContractCharge(input, entry);
    if (!chargeId) return redirectWith(request, "generate_error");
    const interResult = await processInterCharge(profile.company_id, chargeId, profile.id);
    if (interResult.ok) await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "contract", entityId: contract.id, action: "issue_charge", metadata: { chargeId } });
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

  if (!hasValidNfseCodes(fiscalServiceData, false)) {
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
    auto_generate_financial: formData.get("autoGenerateFinancial") === "on",
    auto_issue_nfse: formData.get("autoIssueNfse") === "on",
    auto_generate_charge: formData.get("autoGenerateCharge") === "on",
    fiscal_service_data: fiscalServiceData,
    notes: readString(formData, "notes") || null,
    updated_by: profile.id,
    updated_at: new Date().toISOString()
  };

  const wantsAutomation = contractPayload.auto_generate_financial || contractPayload.auto_issue_nfse || contractPayload.auto_generate_charge;
  let enablesAutomation = wantsAutomation;
  if (action === "update" && contractId && wantsAutomation) {
    const { data: existingAutomation } = await supabase.from("contracts")
      .select("auto_generate_financial,auto_issue_nfse,auto_generate_charge")
      .eq("id", contractId).eq("company_id", profile.company_id).maybeSingle();
    enablesAutomation = !existingAutomation?.auto_generate_financial && !existingAutomation?.auto_issue_nfse && !existingAutomation?.auto_generate_charge;
  }
  if (enablesAutomation && !(await tenantHasFeature(profile.tenant_id, "recurring_automation"))) {
    return redirectWith(request, "feature_unavailable");
  }

  if (action === "update") {
    if (!contractId) return redirectWith(request, "invalid");

    const { error } = await supabase
      .from("contracts")
      .update(contractPayload)
      .eq("id", contractId)
      .eq("company_id", profile.company_id);

    if (!error) await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "contract", entityId: contractId, action: "update" });
    return redirectWith(request, error ? "error" : "updated");
  }

  const capacity = await canCreateTenantResource(profile.tenant_id, "recurrences");
  if (!capacity.allowed) return redirectWith(request, "plan_limit");

  const { data: created, error } = await supabase
    .from("contracts")
    .insert({
      company_id: profile.company_id,
      ...contractPayload,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (!error && created) await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "contract", entityId: created.id, action: "create" });

  return redirectWith(request, error ? (isPlanLimitError(error) ? "plan_limit" : "error") : "created");
}
