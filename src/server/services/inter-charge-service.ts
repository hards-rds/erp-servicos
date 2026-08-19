import crypto from "node:crypto";
import { mapInterChargeStatus } from "@/domains/billing/inter";
import { storePrivateFile } from "@/lib/files/app-files";
import {
  cancelInterCharge,
  createInterCharge,
  downloadInterChargePdf,
  getInterCharge
} from "@/lib/integrations/inter-client";
import { loadActiveInterCredentials } from "@/lib/integrations/inter-credentials";
import { createServiceClient } from "@/lib/supabase/server";

type Row = Record<string, unknown>;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function nestedRow(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function firstValue(payload: Row, keys: string[]) {
  const queue: Row[] = [payload];
  while (queue.length) {
    const current = queue.shift() as Row;
    for (const key of keys) {
      if (current[key] !== undefined && current[key] !== null && current[key] !== "") return current[key];
    }
    for (const value of Object.values(current)) {
      if (value && typeof value === "object" && !Array.isArray(value)) queue.push(value as Row);
    }
  }
  return "";
}

function paymentMethod(payload: Row) {
  const origin = clean(firstValue(payload, ["origemRecebimento", "formaRecebimento"])).toUpperCase();
  return origin === "PIX" ? "pix" : origin === "BOLETO" ? "boleto" : null;
}

function eventKey(payload: Row, source: string) {
  return crypto.createHash("sha256").update(`${source}:${JSON.stringify(payload)}`).digest("hex");
}

export async function applyInterChargePayload(input: {
  companyId: string;
  chargeId: string;
  payload: Row;
  source: "emissao" | "consulta" | "webhook" | "cancelamento";
  actorId?: string | null;
}) {
  const supabase = createServiceClient();
  const { data: charge } = await supabase
    .from("boleto_charges")
    .select("id,financial_entry_id,status")
    .eq("id", input.chargeId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (!charge) throw new Error("Cobranca nao encontrada para esta empresa.");

  const rawStatus = firstValue(input.payload, ["situacao", "status"]);
  const status = input.source === "cancelamento" ? "cancelada" : mapInterChargeStatus(rawStatus);
  const barcode = clean(firstValue(input.payload, ["codigoBarras", "codigoDeBarras"]));
  const digitableLine = clean(firstValue(input.payload, ["linhaDigitavel"]));
  const pixCode = clean(firstValue(input.payload, ["pixCopiaECola", "pixCopiaCola", "qrCode"]));
  const paidAmountRaw = clean(firstValue(input.payload, ["valorTotalRecebido", "valorRecebido"])).replace(",", ".");
  const paidAmount = Number(paidAmountRaw);
  const paidAtRaw = clean(firstValue(input.payload, ["dataHoraSituacao", "dataPagamento", "dataRecebimento"]));
  const paidAt = status === "paga" ? paidAtRaw || new Date().toISOString() : null;

  const { data: previous } = await supabase
    .from("boleto_charges")
    .select("response_payload")
    .eq("id", charge.id)
    .maybeSingle();
  const previousPayload = nestedRow(previous?.response_payload);

  await supabase
    .from("boleto_charges")
    .update({
      status,
      barcode: barcode || null,
      digitable_line: digitableLine || null,
      pix_qr_code: pixCode || null,
      paid_at: paidAt,
      paid_amount: Number.isFinite(paidAmount) ? paidAmount : null,
      payment_method: paymentMethod(input.payload),
      response_payload: { ...previousPayload, ...input.payload, lastSource: input.source },
      rejection_message: null,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", charge.id)
    .eq("company_id", input.companyId);

  await supabase.from("boleto_charge_events").upsert({
    company_id: input.companyId,
    boleto_charge_id: charge.id,
    event_key: eventKey(input.payload, input.source),
    status,
    payload: input.payload
  }, { onConflict: "boleto_charge_id,event_key", ignoreDuplicates: true });

  if (status === "paga") {
    const receivedAmount = Number.isFinite(paidAmount) ? paidAmount : undefined;
    await supabase
      .from("financial_entries")
      .update({
        status: "recebido",
        received_at: (paidAt || new Date().toISOString()).slice(0, 10),
        ...(receivedAmount !== undefined ? { received_amount: receivedAmount } : {}),
        payment_method: paymentMethod(input.payload) || "boleto",
        payment_notes: "Baixa automatica pelo webhook do Banco Inter.",
        updated_by: input.actorId || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", charge.financial_entry_id)
      .eq("company_id", input.companyId)
      .neq("status", "cancelado");

    await supabase
      .from("sales")
      .update({ status: "recebida", updated_by: input.actorId || null, updated_at: new Date().toISOString() })
      .eq("financial_entry_id", charge.financial_entry_id)
      .eq("company_id", input.companyId);
  }

  return { status };
}

async function chargeContext(companyId: string, chargeId: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("boleto_charges")
    .select(`
      id,company_id,financial_entry_id,external_id,status,idempotency_key,
      financial_entries(id,client_id,description,due_date,net_amount,clients(legal_name,document,financial_email,fiscal_email))
    `)
    .eq("id", chargeId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message || "Cobranca nao encontrada.");
  const entry = relation(data.financial_entries as unknown as Row | Row[] | null);
  const client = relation(entry?.clients as unknown as Row | Row[] | null);
  if (!entry || !client) throw new Error("Entrada financeira ou pagador nao encontrado para a cobranca.");
  return { charge: data, entry, client };
}

export async function processInterCharge(companyId: string, chargeId: string, actorId?: string | null) {
  const supabase = createServiceClient();
  try {
    const { charge, entry, client } = await chargeContext(companyId, chargeId);
    const credentials = await loadActiveInterCredentials(companyId);

    if (charge.external_id) {
      const payload = await getInterCharge(charge.external_id, credentials);
      await applyInterChargePayload({ companyId, chargeId, payload, source: "consulta", actorId });
      return { ok: true, status: mapInterChargeStatus(firstValue(payload, ["situacao", "status"])) };
    }

    const result = await createInterCharge({
      entryId: clean(entry.id),
      dueDate: clean(entry.due_date),
      amountCents: Math.round(Number(entry.net_amount) * 100),
      payerDocument: clean(client.document),
      payerName: clean(client.legal_name),
      payerEmail: clean(client.financial_email || client.fiscal_email),
      description: clean(entry.description),
      seuNumero: clean(entry.id).replace(/\D/g, "").slice(0, 15)
    }, credentials);

    if (!result.ok) {
      const message = result.message || result.errors?.join(" ") || "Banco Inter recusou a cobranca.";
      await supabase.from("boleto_charges").update({
        status: "erro_integracao",
        rejection_message: message,
        response_payload: result.responsePayload || {},
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq("id", chargeId).eq("company_id", companyId);
      return { ok: false, status: "erro_integracao", message };
    }

    await supabase.from("boleto_charges").update({
      status: result.status,
      external_id: result.externalId,
      request_payload: result.requestPayload,
      response_payload: result.responsePayload,
      rejection_message: null,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", chargeId).eq("company_id", companyId);

    await supabase.from("financial_entries").update({
      status: "aguardando_pagamento",
      charge_id: chargeId,
      updated_by: actorId || null,
      updated_at: new Date().toISOString()
    }).eq("id", clean(entry.id)).eq("company_id", companyId)
      .in("status", ["previsto", "emitido", "aguardando_pagamento", "vencido"]);

    await supabase.from("boleto_charge_events").upsert({
      company_id: companyId,
      boleto_charge_id: chargeId,
      event_key: eventKey(result.responsePayload || {}, "emissao"),
      status: result.status,
      payload: result.responsePayload || {}
    }, { onConflict: "boleto_charge_id,event_key", ignoreDuplicates: true });
    return { ok: true, status: result.status, externalId: result.externalId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na integracao com o Banco Inter.";
    await supabase.from("boleto_charges").update({
      status: "erro_integracao",
      rejection_message: message,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", chargeId).eq("company_id", companyId);
    return { ok: false, status: "erro_integracao", message };
  }
}

export async function cancelStoredInterCharge(companyId: string, chargeId: string, reason: string, actorId?: string | null) {
  const { charge } = await chargeContext(companyId, chargeId);
  if (!charge.external_id) throw new Error("A cobranca ainda nao possui identificador no Banco Inter.");
  const credentials = await loadActiveInterCredentials(companyId);
  const payload = await cancelInterCharge(charge.external_id, reason, credentials);
  await applyInterChargePayload({ companyId, chargeId, payload, source: "cancelamento", actorId });
}

export async function getStoredInterChargePdf(companyId: string, chargeId: string, actorId?: string | null) {
  const { charge } = await chargeContext(companyId, chargeId);
  if (!charge.external_id) throw new Error("A cobranca ainda nao possui identificador no Banco Inter.");
  const credentials = await loadActiveInterCredentials(companyId);
  const content = await downloadInterChargePdf(charge.external_id, credentials);
  const path = `${companyId}/inter/${chargeId}/cobranca.pdf`;
  const fileId = await storePrivateFile({ companyId, path, content, contentType: "application/pdf", createdBy: actorId });
  const supabase = createServiceClient();
  await supabase.from("boleto_charges").update({ pdf_file_id: fileId, updated_at: new Date().toISOString() }).eq("id", chargeId).eq("company_id", companyId);
  return content;
}
