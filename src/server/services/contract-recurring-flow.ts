import type { SupabaseClient } from "@supabase/supabase-js";
import { dueDateForCompetence } from "../../lib/dates/competence.ts";

export type ContractFlowInput = {
  supabase: SupabaseClient;
  companyId: string;
  actorId?: string | null;
  contractId: string;
  clientId: string;
  description: string;
  amount: number;
  dueDay: number;
};

export type ContractEntry = {
  entryId: string;
  competence: string;
  dueDate: string;
};

export async function ensureContractEntry(input: ContractFlowInput, competence: string): Promise<ContractEntry | null> {
  const dueDate = dueDateForCompetence(competence, input.dueDay);
  const entryKey = `contract:${input.contractId}:competence:${competence}:due:${dueDate}`;
  const payload = {
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
    created_by: input.actorId || null,
    updated_by: input.actorId || null
  };

  const { data, error } = await input.supabase
    .from("financial_entries")
    .upsert(payload, { onConflict: "company_id,idempotency_key", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (error) return null;
  if (data?.id) return { entryId: data.id, competence, dueDate };

  const { data: existing } = await input.supabase
    .from("financial_entries")
    .select("id,status")
    .eq("company_id", input.companyId)
    .eq("idempotency_key", entryKey)
    .maybeSingle();
  return existing?.id && existing.status !== "cancelado" ? { entryId: existing.id, competence, dueDate } : null;
}

export async function ensureContractNfse(
  input: ContractFlowInput,
  entry: ContractEntry,
  fiscalData: Record<string, unknown>
) {
  const nfseKey = `nfse:contract:${input.contractId}:competence:${entry.competence}`;
  const payload = {
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
      serviceDescription: input.description,
      dueDate: entry.dueDate,
      ...fiscalData
    }
  };
  const { data, error } = await input.supabase
    .from("nfse_documents")
    .upsert(payload, { onConflict: "company_id,idempotency_key", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (error) return null;

  let documentId = data?.id || null;
  if (!documentId) {
    const { data: existing } = await input.supabase
      .from("nfse_documents")
      .select("id")
      .eq("company_id", input.companyId)
      .eq("idempotency_key", nfseKey)
      .maybeSingle();
    documentId = existing?.id || null;
  }
  if (!documentId) return null;

  await Promise.all([
    input.supabase
      .from("nfse_documents")
      .update({ financial_entry_id: entry.entryId, updated_at: new Date().toISOString() })
      .eq("id", documentId)
      .eq("company_id", input.companyId),
    input.supabase
      .from("financial_entries")
      .update({ nfse_document_id: documentId, updated_at: new Date().toISOString() })
      .eq("id", entry.entryId)
      .eq("company_id", input.companyId)
  ]);
  return documentId;
}

export async function ensureContractCharge(input: ContractFlowInput, entry: ContractEntry) {
  const chargeKey = `inter-charge:${entry.entryId}:${entry.dueDate}`;
  const payload = {
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
  };
  const { data, error } = await input.supabase
    .from("boleto_charges")
    .upsert(payload, { onConflict: "company_id,idempotency_key", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (error) return null;
  if (data?.id) return data.id as string;

  const { data: existing } = await input.supabase
    .from("boleto_charges")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("idempotency_key", chargeKey)
    .maybeSingle();
  return existing?.id || null;
}
