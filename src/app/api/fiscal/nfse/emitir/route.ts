import { requestNfseEmission, requestNfseNationalEmission } from "@/lib/integrations/nfse-client";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";
import { mergeNfseFiscalData } from "@/lib/integrations/nfse-national";
import { loadRuntimeCertificate } from "@/lib/certificates/runtime-certificate";
import { generateAndAttachDanfsePdf } from "@/lib/fiscal/danfse";
import { logFiscalEmail, sendFiscalDocumentEmail } from "@/lib/email/fiscal-email";
import { dueDateForCompetence } from "@/lib/dates/competence";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/fiscal/emissao-nfse?status=${status}`, request.url), 303);
}

function redirectWithMessage(request: NextRequest, status: string, message: string) {
  const target = new URL("/fiscal/emissao-nfse", request.url);
  target.searchParams.set("status", status);
  target.searchParams.set("message", message);
  return NextResponse.redirect(target, 303);
}

type Row = Record<string, unknown>;

function row(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

async function ensureAuthorizedFinancialEntry(input: {
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createServerSupabaseClient>>;
  companyId: string;
  profileId: string;
  documentId: string;
  clientId: string;
  existingEntry: { id: string; status: string } | null;
  contract: { id: string; due_day: number; service_description: string } | null;
  competence: string;
  amount: number | string;
  requestPayload: Row;
}) {
  if (input.existingEntry) return input.existingEntry;
  if (!input.contract) throw new Error("Contrato da NFS-e nao encontrado para gerar o financeiro.");

  const dueDate = String(input.requestPayload.dueDate || "")
    || dueDateForCompetence(input.competence, Number(input.contract.due_day));
  const idempotencyKey = `contract:${input.contract.id}:competence:${input.competence}:due:${dueDate}`;
  const payload = {
    company_id: input.companyId,
    client_id: input.clientId,
    contract_id: input.contract.id,
    nfse_document_id: input.documentId,
    type: "recorrente",
    description: String(input.requestPayload.serviceDescription || input.contract.service_description),
    competence: input.competence,
    due_date: dueDate,
    gross_amount: Number(input.amount),
    discounts: 0,
    interest: 0,
    penalty: 0,
    net_amount: Number(input.amount),
    status: "emitido",
    issued_at: new Date().toISOString().slice(0, 10),
    idempotency_key: idempotencyKey,
    notes: "Gerado automaticamente apos autorizacao da NFS-e.",
    created_by: input.profileId,
    updated_by: input.profileId
  };
  const { data: created, error } = await input.supabase
    .from("financial_entries")
    .insert(payload)
    .select("id,status")
    .single();
  if (!error && created) return created;

  const { data: existing } = await input.supabase
    .from("financial_entries")
    .select("id,status")
    .eq("company_id", input.companyId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing) return existing;
  throw new Error(error?.message || "Nao foi possivel gerar a entrada financeira da NFS-e.");
}

export async function POST(request: NextRequest) {
  const access = await requireCompanyPermission({ module: "fiscal.nfse", action: "emitir" });
  if (!access.ok) {
    const isForm = (request.headers.get("content-type") || "").includes("form");
    if (access.reason === "unauthorized") {
      return isForm
        ? NextResponse.redirect(new URL("/login", request.url), 303)
        : NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }
    return isForm
      ? redirectWith(request, access.reason === "forbidden" ? "forbidden" : "profile_error")
      : NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }
  const { supabase, profile } = access;

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("form")) {
      const draft = await request.json();
      const result = await requestNfseEmission(draft);
      return NextResponse.json(result, { status: result.ok ? 200 : 422 });
    }

    const formData = await request.formData();
    const nfseDocumentId = String(formData.get("nfseDocumentId") || "").trim();
    if (!nfseDocumentId) return redirectWith(request, "invalid");
    if (
      process.env.NFSE_ENV === "production"
      && process.env.NFSE_REAL_EMISSION === "true"
      && formData.get("productionConfirmed") !== "true"
    ) {
      return redirectWithMessage(request, "rejected", "Confirme explicitamente a emissao real em producao.");
    }

    const { data: document } = await supabase
      .from("nfse_documents")
      .select(`
        id,
        company_id,
        client_id,
        financial_entry_id,
        competence,
        service_amount,
        request_payload,
        companies(name,document,fiscal_settings),
        clients(legal_name,document,fiscal_email,phone,address),
        financial_entries(id,contract_id,description,competence,net_amount,status,contracts(fiscal_service_data))
      `)
      .eq("id", nfseDocumentId)
      .eq("company_id", profile.company_id)
      .maybeSingle();

    if (!document) return redirectWith(request, "not_found");

    const company = Array.isArray(document.companies) ? document.companies[0] : document.companies;
    const client = Array.isArray(document.clients) ? document.clients[0] : document.clients;
    const entry = Array.isArray(document.financial_entries) ? document.financial_entries[0] : document.financial_entries;
    const requestPayload = row(document.request_payload);
    const contractId = entry?.contract_id || String(requestPayload.contractId || "");
    const { data: loadedContract } = contractId
      ? await supabase
        .from("contracts")
        .select("id,due_day,service_description,fiscal_service_data")
        .eq("id", contractId)
        .eq("company_id", profile.company_id)
        .maybeSingle()
      : { data: null };
    const relatedContract = Array.isArray(entry?.contracts) ? entry?.contracts[0] : entry?.contracts;
    const contract = loadedContract || (relatedContract ? {
      id: contractId,
      due_day: Number(requestPayload.dueDay || 10),
      service_description: entry?.description || String(requestPayload.serviceDescription || "Prestacao de servicos"),
      fiscal_service_data: relatedContract.fiscal_service_data
    } : null);
    const fiscalData = mergeNfseFiscalData(document.request_payload, contract?.fiscal_service_data);
    const emissionEntry = entry || {
      id: document.id,
      description: String(requestPayload.serviceDescription || contract?.service_description || ""),
      competence: document.competence,
      net_amount: document.service_amount
    };

    if (!company || !client || !emissionEntry.description) return redirectWith(request, "invalid");

    const runtimeCertificate = await loadRuntimeCertificate(profile.company_id);
    const result = await requestNfseNationalEmission({
      documentId: document.id,
      company,
      client,
      entry: emissionEntry,
      fiscalData
    }, runtimeCertificate.certificate, runtimeCertificate.error);

    await supabase
      .from("nfse_documents")
      .update({
        status: result.status,
        protocol: result.protocol || null,
        external_id: result.externalId || null,
        rejection_message: result.ok ? null : result.message,
        request_payload: { ...requestPayload, ...(result.requestPayload || {}) },
        response_payload: result.responsePayload || { message: result.message, provider: result.provider },
        updated_at: new Date().toISOString()
      })
      .eq("id", document.id)
      .eq("company_id", profile.company_id);

    await supabase.from("nfse_events").insert({
      nfse_document_id: document.id,
      status: result.status,
      message: result.message,
      payload: result.responsePayload || result.requestPayload || {},
      created_by: profile.id
    });

    if (result.ok && result.status === "autorizada") {
      const authorizedEntry = await ensureAuthorizedFinancialEntry({
        supabase,
        companyId: profile.company_id,
        profileId: profile.id,
        documentId: document.id,
        clientId: document.client_id,
        existingEntry: entry ? { id: entry.id, status: entry.status } : null,
        contract,
        competence: document.competence,
        amount: document.service_amount,
        requestPayload
      });

      await supabase
        .from("financial_entries")
        .update({
          nfse_document_id: document.id,
          issued_at: new Date().toISOString().slice(0, 10),
          ...(authorizedEntry.status === "previsto" ? { status: "emitido" } : {}),
          updated_by: profile.id,
          updated_at: new Date().toISOString()
        })
        .eq("id", authorizedEntry.id)
        .eq("company_id", profile.company_id);

      await supabase
        .from("nfse_documents")
        .update({ financial_entry_id: authorizedEntry.id, updated_at: new Date().toISOString() })
        .eq("id", document.id)
        .eq("company_id", profile.company_id);

      try {
        const generated = await generateAndAttachDanfsePdf(document.id, profile.id);
        const recipient = client.fiscal_email || "";
        const subject = `NFS-e ${result.externalId || document.id.slice(0, 8)} - Mundo Livre tecnologia`;
        const emailResult = await sendFiscalDocumentEmail({
          companyId: profile.company_id,
          to: recipient,
          subject,
          html: `
            <p>Ola, ${client.legal_name}.</p>
            <p>Segue em anexo o DANFSe referente a competencia ${document.competence}.</p>
            <p>Atenciosamente,<br/>Mundo Livre tecnologia</p>
          `,
          attachments: [{
            filename: generated.fileName,
            content: generated.content,
            contentType: "application/pdf"
          }]
        });
        await logFiscalEmail({
          companyId: profile.company_id,
          recipient: recipient || "-",
          subject,
          result: emailResult,
          metadata: { nfseDocumentId: document.id, automatic: true }
        });
      } catch (postProcessError) {
        await supabase.from("nfse_events").insert({
          nfse_document_id: document.id,
          status: "pos_emissao_pendente",
          message: postProcessError instanceof Error ? postProcessError.message : "Nao foi possivel gerar/enviar DANFSe automaticamente.",
          payload: { automatic: true },
          created_by: profile.id
        });
      }
    }

    await writeCompanyAudit({
      companyId: profile.company_id,
      actorId: profile.id,
      entity: "nfse_document",
      entityId: document.id,
      action: "emit",
      metadata: { status: result.status, provider: result.provider }
    });

    return redirectWithMessage(
      request,
      result.status === "autorizada" ? "processed" : result.ok ? "queued" : "rejected",
      result.message
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na emissao fiscal.";
    if ((request.headers.get("content-type") || "").includes("form")) {
      return NextResponse.redirect(new URL(`/fiscal/emissao-nfse?status=error&message=${encodeURIComponent(message)}`, request.url), 303);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
