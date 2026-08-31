import { isRecurringCompetenceDue } from "../../domains/contracts/recurrence.ts";
import type { ContractStatus, Periodicity } from "../../domains/contracts/types.ts";
import { competenceFromDate, dueDateForCompetence } from "../../lib/dates/competence.ts";
import { createServiceClient } from "../../lib/supabase/server.ts";
import { notifyCompany } from "./app-notification-service.ts";
import {
  ensureContractCharge,
  ensureContractEntry,
  ensureContractNfse,
  type ContractFlowInput
} from "./contract-recurring-flow.ts";
import { processInterCharge } from "./inter-charge-service.ts";

type ContractRow = {
  id: string;
  company_id: string;
  client_id: string;
  service_description: string;
  recurring_amount: number | string;
  periodicity: Periodicity;
  due_day: number;
  starts_at: string;
  ends_at: string | null;
  status: ContractStatus;
  auto_generate_financial: boolean;
  auto_issue_nfse: boolean;
  auto_generate_charge: boolean;
  fiscal_service_data: Record<string, unknown> | null;
};

type EnrollmentRow = {
  id: string;
  company_id: string;
  due_day: number;
  monthly_amount: number | string;
  discount_amount: number | string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  school_athletes: { full_name: string } | { full_name: string }[] | null;
  school_guardians: { full_name: string; client_id: string | null } | { full_name: string; client_id: string | null }[] | null;
};

export type RecurrenceAutomationSummary = {
  competence: string;
  eligible: number;
  processed: number;
  skipped: number;
  completed: number;
  partial: number;
  failed: number;
  alerts: number;
  fixedPayablesGenerated: number;
};

function validFiscalData(data: Record<string, unknown> | null) {
  const serviceCode = String(data?.serviceCode || "");
  const nbsCode = String(data?.nbsCode || "");
  return /^\d{6}$/.test(serviceCode) && (!nbsCode || /^\d{9}$/.test(nbsCode));
}

function relation<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] || null : value;
}

async function claimRun(companyId: string, sourceType: "contract" | "school_enrollment", sourceId: string, competence: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("claim_recurrence_run", {
    target_company_id: companyId,
    target_source_type: sourceType,
    target_source_id: sourceId,
    target_competence: competence
  });
  return error ? null : data as string | null;
}

async function finishRun(input: {
  runId: string;
  companyId: string;
  status: "concluido" | "parcial" | "erro";
  entryId?: string | null;
  documentId?: string | null;
  chargeId?: string | null;
  result?: Record<string, unknown>;
  error?: string | null;
}) {
  const supabase = createServiceClient();
  await supabase.from("recurrence_runs").update({
    status: input.status,
    financial_entry_id: input.entryId || null,
    nfse_document_id: input.documentId || null,
    boleto_charge_id: input.chargeId || null,
    result: input.result || {},
    error_message: input.error || null,
    finished_at: new Date().toISOString()
  }).eq("id", input.runId).eq("company_id", input.companyId);
}

async function processContract(contract: ContractRow, competence: string) {
  const supabase = createServiceClient();
  const runId = await claimRun(contract.company_id, "contract", contract.id, competence);
  if (!runId) return "skipped" as const;

  const input: ContractFlowInput = {
    supabase,
    companyId: contract.company_id,
    actorId: null,
    contractId: contract.id,
    clientId: contract.client_id,
    description: contract.service_description,
    amount: Number(contract.recurring_amount),
    dueDay: Number(contract.due_day)
  };
  const warnings: string[] = [];
  let entryId: string | null = null;
  let documentId: string | null = null;
  let chargeId: string | null = null;

  try {
    const entry = await ensureContractEntry(input, competence);
    if (!entry) throw new Error("Nao foi possivel gerar a entrada financeira.");
    entryId = entry.entryId;

    if (contract.auto_issue_nfse) {
      if (!validFiscalData(contract.fiscal_service_data)) {
        warnings.push("NFS-e nao enfileirada: revise o codigo nacional do servico e o NBS.");
        await notifyCompany({
          supabase,
          companyId: contract.company_id,
          category: "fiscal",
          severity: "aviso",
          title: "Contrato recorrente sem dados fiscais validos",
          message: `${contract.service_description}: revise os codigos antes de emitir a NFS-e de ${competence}.`,
          dedupeKey: `recurrence:${contract.id}:${competence}:fiscal-invalid`,
          link: `/cadastros/contratos/${contract.id}/editar`,
          entityType: "contract",
          entityId: contract.id
        });
      } else {
        documentId = await ensureContractNfse(input, entry, contract.fiscal_service_data || {});
        if (!documentId) warnings.push("Nao foi possivel colocar a NFS-e na fila.");
      }
    }

    if (contract.auto_generate_charge) {
      const { data: credential } = await supabase.from("api_credentials")
        .select("id")
        .eq("company_id", contract.company_id)
        .eq("provider", "banco_inter")
        .eq("active", true)
        .maybeSingle();
      if (!credential) {
        warnings.push("Boleto nao emitido: Banco Inter inativo.");
        await notifyCompany({
          supabase,
          companyId: contract.company_id,
          category: "cobranca",
          severity: "aviso",
          title: "Cobranca automatica aguardando integracao",
          message: `${contract.service_description}: ative o Banco Inter para emitir a cobranca de ${competence}.`,
          dedupeKey: `recurrence:${contract.id}:${competence}:inter-inactive`,
          link: "/configuracoes/apis/inter",
          entityType: "contract",
          entityId: contract.id
        });
      } else {
        chargeId = await ensureContractCharge(input, entry);
        if (!chargeId) {
          warnings.push("Nao foi possivel preparar a cobranca.");
        } else {
          const chargeResult = await processInterCharge(contract.company_id, chargeId, null);
          if (!chargeResult.ok) warnings.push(chargeResult.message || "Banco Inter recusou a cobranca.");
        }
      }
    }

    const status = warnings.length ? "parcial" : "concluido";
    await finishRun({ runId, companyId: contract.company_id, status, entryId, documentId, chargeId, result: { warnings } });
    if (warnings.length) {
      await notifyCompany({
        supabase,
        companyId: contract.company_id,
        category: "recorrencia",
        severity: "aviso",
        title: "Competencia processada com pendencias",
        message: `${contract.service_description} (${competence}): ${warnings.join(" ")}`,
        dedupeKey: `recurrence:${contract.id}:${competence}:partial`,
        link: "/configuracoes/automacoes",
        entityType: "contract",
        entityId: contract.id
      });
    }
    return warnings.length ? "partial" as const : "completed" as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha inesperada na recorrencia.";
    await finishRun({ runId, companyId: contract.company_id, status: "erro", entryId, documentId, chargeId, error: message });
    await notifyCompany({
      supabase,
      companyId: contract.company_id,
      category: "recorrencia",
      severity: "erro",
      title: "Falha ao gerar competencia recorrente",
      message: `${contract.service_description} (${competence}): ${message}`,
      dedupeKey: `recurrence:${contract.id}:${competence}:error`,
      link: "/configuracoes/automacoes",
      entityType: "contract",
      entityId: contract.id
    });
    return "failed" as const;
  }
}

function enrollmentDue(enrollment: EnrollmentRow, competence: string) {
  const competenceStart = `${competence}-01`;
  const competenceEnd = dueDateForCompetence(competence, 31);
  return enrollment.status === "ativa"
    && enrollment.starts_at <= competenceEnd
    && (!enrollment.ends_at || enrollment.ends_at >= competenceStart);
}

async function processEnrollment(enrollment: EnrollmentRow, competence: string) {
  const supabase = createServiceClient();
  const runId = await claimRun(enrollment.company_id, "school_enrollment", enrollment.id, competence);
  if (!runId) return "skipped" as const;
  const athlete = relation(enrollment.school_athletes);
  const guardian = relation(enrollment.school_guardians);
  const grossAmount = Number(enrollment.monthly_amount);
  const discount = Math.min(Number(enrollment.discount_amount), grossAmount);
  const dueDate = dueDateForCompetence(competence, Number(enrollment.due_day));
  const idempotencyKey = `school-enrollment:${enrollment.id}:competence:${competence}`;
  try {
    const { error } = await supabase.from("financial_entries").upsert({
      company_id: enrollment.company_id,
      client_id: guardian?.client_id || null,
      school_enrollment_id: enrollment.id,
      type: "recorrente",
      description: `Mensalidade escolar - ${athlete?.full_name || "Atleta"}`,
      competence,
      due_date: dueDate,
      gross_amount: grossAmount,
      discounts: discount,
      interest: 0,
      penalty: 0,
      net_amount: grossAmount - discount,
      status: "previsto",
      idempotency_key: idempotencyKey,
      notes: guardian?.full_name ? `Responsavel: ${guardian.full_name}` : "Mensalidade gerada automaticamente a partir da matricula.",
      created_by: null,
      updated_by: null,
      updated_at: new Date().toISOString()
    }, { onConflict: "company_id,idempotency_key", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    const { data: entry } = await supabase.from("financial_entries").select("id")
      .eq("company_id", enrollment.company_id).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (!entry?.id) throw new Error("A mensalidade nao foi encontrada apos a geracao.");
    await finishRun({ runId, companyId: enrollment.company_id, status: "concluido", entryId: entry.id });
    return "completed" as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao gerar mensalidade.";
    await finishRun({ runId, companyId: enrollment.company_id, status: "erro", error: message });
    await notifyCompany({
      supabase,
      companyId: enrollment.company_id,
      category: "financeiro",
      severity: "erro",
      title: "Falha ao gerar mensalidade",
      message: `${athlete?.full_name || "Atleta"} (${competence}): ${message}`,
      dedupeKey: `recurrence:school-enrollment:${enrollment.id}:${competence}:error`,
      link: "/escola/matriculas",
      entityType: "school_enrollment",
      entityId: enrollment.id
    });
    return "failed" as const;
  }
}

type DueRow = { id: string; company_id: string; description: string; due_date: string; status: string };

async function loadDueRows(
  table: "financial_entries" | "payables",
  statuses: string[],
  dueUntil: string,
  companyId?: string
) {
  const supabase = createServiceClient();
  const rows: DueRow[] = [];
  const pageSize = 1000;
  for (let page = 0; page < 20; page += 1) {
    let query = supabase.from(table).select("id,company_id,description,due_date,status")
      .in("status", statuses).lte("due_date", dueUntil).order("due_date").range(page * pageSize, (page + 1) * pageSize - 1);
    if (companyId) query = query.eq("company_id", companyId);
    const { data, error } = await query;
    if (error) throw new Error(`Nao foi possivel carregar alertas de ${table}: ${error.message}`);
    rows.push(...((data || []) as DueRow[]));
    if ((data || []).length < pageSize) break;
  }
  return rows;
}

async function createFinancialAlerts(companyId?: string) {
  const supabase = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const dueUntil = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const [entries, payables] = await Promise.all([
    loadDueRows("financial_entries", ["previsto", "emitido", "aguardando_pagamento", "vencido"], dueUntil, companyId),
    loadDueRows("payables", ["previsto", "aprovado", "vencido"], dueUntil, companyId)
  ]);

  for (const entry of entries) {
    const overdue = entry.due_date < today;
    if (overdue && entry.status !== "vencido") {
      await supabase.from("financial_entries").update({ status: "vencido", updated_at: new Date().toISOString() })
        .eq("id", entry.id).eq("company_id", entry.company_id).in("status", ["previsto", "emitido", "aguardando_pagamento"]);
    }
    await notifyCompany({
      supabase,
      companyId: entry.company_id,
      category: "financeiro",
      severity: overdue ? "erro" : "aviso",
      title: overdue ? "Entrada financeira vencida" : "Entrada proxima do vencimento",
      message: `${entry.description} vence${overdue ? "u" : ""} em ${new Date(`${entry.due_date}T12:00:00`).toLocaleDateString("pt-BR")}.`,
      dedupeKey: `financial-entry:${entry.id}:due:${entry.due_date}`,
      link: "/financeiro/entradas",
      entityType: "financial_entry",
      entityId: entry.id
    });
  }

  for (const payable of payables) {
    const overdue = payable.due_date < today;
    if (overdue && payable.status !== "vencido") {
      await supabase.from("payables").update({ status: "vencido", updated_at: new Date().toISOString() })
        .eq("id", payable.id).eq("company_id", payable.company_id).in("status", ["previsto", "aprovado"]);
    }
    await notifyCompany({
      supabase,
      companyId: payable.company_id,
      category: "financeiro",
      severity: overdue ? "erro" : "aviso",
      title: overdue ? "Conta a pagar vencida" : "Conta a pagar proxima do vencimento",
      message: `${payable.description} vence${overdue ? "u" : ""} em ${new Date(`${payable.due_date}T12:00:00`).toLocaleDateString("pt-BR")}.`,
      dedupeKey: `payable:${payable.id}:due:${payable.due_date}`,
      link: "/financeiro/saidas",
      entityType: "payable",
      entityId: payable.id
    });
  }
  return entries.length + payables.length;
}

export async function runRecurringAutomation(options?: { competence?: string; companyId?: string }) {
  const competence = options?.competence || competenceFromDate(new Date());
  const today = new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}$/.test(competence)) throw new Error("Competencia invalida.");
  const supabase = createServiceClient();
  let eligibleCompanyIds: Set<string> | null = null;
  if (!options?.companyId) {
    const { data: eligibleTenants, error: planError } = await supabase.from("tenants")
      .select("id")
      .in("plan", ["pro", "enterprise"])
      .in("status", ["active", "trial"]);
    if (planError) throw new Error(`Nao foi possivel validar os planos: ${planError.message}`);
    const tenantIds = (eligibleTenants || []).map((tenant) => tenant.id);
    const { data: eligibleCompanies, error: companyError } = tenantIds.length
      ? await supabase.from("companies").select("id").in("tenant_id", tenantIds).eq("active", true)
      : { data: [], error: null };
    if (companyError) throw new Error(`Nao foi possivel validar as empresas: ${companyError.message}`);
    eligibleCompanyIds = new Set((eligibleCompanies || []).map((company) => company.id));
  }
  let query = supabase.from("contracts")
    .select("id,company_id,client_id,service_description,recurring_amount,periodicity,due_day,starts_at,ends_at,status,auto_generate_financial,auto_issue_nfse,auto_generate_charge,fiscal_service_data")
    .eq("status", "ativo")
    .or("auto_generate_financial.eq.true,auto_issue_nfse.eq.true,auto_generate_charge.eq.true");
  if (options?.companyId) query = query.eq("company_id", options.companyId);
  const { data, error } = await query;
  if (error) throw new Error(`Nao foi possivel carregar os contratos: ${error.message}`);

  let enrollmentQuery = supabase.from("school_enrollments")
    .select("id,company_id,due_day,monthly_amount,discount_amount,starts_at,ends_at,status,school_athletes(full_name),school_guardians(full_name,client_id)")
    .eq("status", "ativa")
    .eq("auto_generate_financial", true);
  if (options?.companyId) enrollmentQuery = enrollmentQuery.eq("company_id", options.companyId);
  const { data: enrollmentData, error: enrollmentError } = await enrollmentQuery;
  if (enrollmentError) throw new Error(`Nao foi possivel carregar as matriculas: ${enrollmentError.message}`);

  const contracts = ((data || []) as ContractRow[]).filter((contract) => (
    (!eligibleCompanyIds || eligibleCompanyIds.has(contract.company_id))
    && contract.starts_at <= today
    && (!contract.ends_at || contract.ends_at >= today)
    && isRecurringCompetenceDue({
      startsAt: contract.starts_at,
      endsAt: contract.ends_at || undefined,
      periodicity: contract.periodicity,
      status: contract.status
    }, competence)
  ));
  const enrollments = ((enrollmentData || []) as EnrollmentRow[]).filter((enrollment) => (
    (!eligibleCompanyIds || eligibleCompanyIds.has(enrollment.company_id))
    && enrollment.starts_at <= today
    && (!enrollment.ends_at || enrollment.ends_at >= today)
    && enrollmentDue(enrollment, competence)
  ));
  const summary: RecurrenceAutomationSummary = {
    competence,
    eligible: contracts.length + enrollments.length,
    processed: 0,
    skipped: 0,
    completed: 0,
    partial: 0,
    failed: 0,
    alerts: 0,
    fixedPayablesGenerated: 0
  };
  const byCompany = new Map<string, { completed: number; partial: number; failed: number }>();

  function countCompany(companyId: string, result: "completed" | "partial" | "failed" | "skipped") {
    if (result === "skipped") return;
    const current = byCompany.get(companyId) || { completed: 0, partial: 0, failed: 0 };
    current[result] += 1;
    byCompany.set(companyId, current);
  }

  for (const contract of contracts) {
    const result = await processContract(contract, competence);
    summary[result] += 1;
    if (result !== "skipped") summary.processed += 1;
    countCompany(contract.company_id, result);
  }
  for (const enrollment of enrollments) {
    const result = await processEnrollment(enrollment, competence);
    summary[result] += 1;
    if (result !== "skipped") summary.processed += 1;
    countCompany(enrollment.company_id, result);
  }

  const { data: generatedPayables, error: payableScheduleError } = await supabase.rpc("ensure_fixed_payable_horizon", {
    target_competence: competence,
    target_company_id: options?.companyId || null,
    forecast_months: 12
  });
  if (payableScheduleError) {
    throw new Error(`Nao foi possivel atualizar as despesas fixas: ${payableScheduleError.message}`);
  }
  summary.fixedPayablesGenerated = Number(generatedPayables || 0);

  summary.alerts = await createFinancialAlerts(options?.companyId);

  const runDate = new Date().toISOString().slice(0, 10);
  for (const [companyId, companySummary] of byCompany) {
    await notifyCompany({
      supabase,
      companyId,
      category: "recorrencia",
      severity: companySummary.failed ? "erro" : companySummary.partial ? "aviso" : "sucesso",
      title: "Processamento recorrente concluido",
      message: `${competence}: ${companySummary.completed} concluidos, ${companySummary.partial} com pendencias e ${companySummary.failed} com erro.`,
      dedupeKey: `recurrence-summary:${competence}:${runDate}`,
      link: "/configuracoes/automacoes"
    });
  }
  return summary;
}
