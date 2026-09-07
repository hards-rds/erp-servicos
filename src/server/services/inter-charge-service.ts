import crypto from "node:crypto";
import { mapInterChargeStatus } from "@/domains/billing/inter";
import { storePrivateFile } from "@/lib/files/app-files";
import {
  cancelInterCharge,
  createInterCharge,
  downloadInterChargePdf,
  getInterCharge,
  listInterCharges
} from "@/lib/integrations/inter-client";
import { loadActiveInterCredentials } from "@/lib/integrations/inter-credentials";
import { lookupCnpjRegistration } from "@/lib/integrations/brasil-api";
import { createServiceClient } from "@/lib/supabase/server";

type Row = Record<string, unknown>;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function onlyDigits(value: unknown) {
  return clean(value).replace(/\D/g, "");
}

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function nestedRow(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function payerAddress(value: unknown) {
  const address = nestedRow(value);
  return {
    street: clean(address.street),
    number: clean(address.number),
    complement: clean(address.complement),
    district: clean(address.district),
    city: clean(address.city),
    state: clean(address.state).toUpperCase(),
    zipCode: clean(address.zipCode).replace(/\D/g, "")
  };
}

function completePayerAddress(address: ReturnType<typeof payerAddress>) {
  return Boolean(address.street && address.city && /^[A-Z]{2}$/.test(address.state) && /^\d{8}$/.test(address.zipCode));
}

async function resolvePayerAddress(companyId: string, client: Row) {
  const current = payerAddress(client.address);
  if (completePayerAddress(current) || onlyDigits(client.document).length !== 14) return current;

  try {
    const registration = await lookupCnpjRegistration(clean(client.document));
    const resolved = payerAddress({ ...registration.address, ...Object.fromEntries(Object.entries(current).filter(([, value]) => value)) });
    if (completePayerAddress(resolved)) {
      const supabase = createServiceClient();
      await supabase
        .from("clients")
        .update({ address: resolved, updated_at: new Date().toISOString() })
        .eq("id", clean(client.id))
        .eq("company_id", companyId);
    }
    return resolved;
  } catch {
    return current;
  }
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
  source: "emissao" | "consulta" | "webhook" | "cancelamento" | "importacao";
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
  const paidAmount = paidAmountRaw ? Number(paidAmountRaw) : Number.NaN;
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

export async function listStoredInterCharges(companyId: string, from: string, to: string) {
  const credentials = await loadActiveInterCredentials(companyId);
  return listInterCharges({ from, to }, credentials);
}

export async function importStoredInterCharge(input: {
  companyId: string;
  entryId: string;
  externalId: string;
  actorId?: string | null;
}) {
  const supabase = createServiceClient();
  const { data: entry, error: entryError } = await supabase
    .from("financial_entries")
    .select("id,status,due_date")
    .eq("id", input.entryId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (entryError || !entry || entry.status === "cancelado") {
    throw new Error("Entrada financeira invalida para vinculacao.");
  }

  const { data: alreadyLinked } = await supabase
    .from("boleto_charges")
    .select("id,financial_entry_id")
    .eq("external_id", input.externalId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (alreadyLinked && alreadyLinked.financial_entry_id !== entry.id) {
    throw new Error("Esta cobranca do Inter ja esta vinculada a outra entrada.");
  }

  const credentials = await loadActiveInterCredentials(input.companyId);
  const payload = await getInterCharge(input.externalId, credentials);
  const verifiedExternalId = clean(firstValue(payload, ["codigoSolicitacao"]));
  if (verifiedExternalId !== input.externalId) {
    throw new Error("O Banco Inter retornou um identificador diferente do solicitado.");
  }

  let chargeId = clean(alreadyLinked?.id);
  if (!chargeId) {
    const { data: draft } = await supabase
      .from("boleto_charges")
      .select("id")
      .eq("company_id", input.companyId)
      .eq("financial_entry_id", entry.id)
      .is("external_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (draft?.id) {
      const { data: updated, error } = await supabase
        .from("boleto_charges")
        .update({
          external_id: input.externalId,
          request_payload: { source: "inter_import" },
          updated_at: new Date().toISOString()
        })
        .eq("id", draft.id)
        .eq("company_id", input.companyId)
        .is("external_id", null)
        .select("id")
        .single();
      if (error || !updated?.id) throw new Error(error?.message || "Nao foi possivel vincular a cobranca existente.");
      chargeId = updated.id;
    } else {
      const { data: inserted, error } = await supabase
        .from("boleto_charges")
        .insert({
          company_id: input.companyId,
          financial_entry_id: entry.id,
          external_id: input.externalId,
          status: mapInterChargeStatus(firstValue(payload, ["situacao", "status"])),
          request_payload: { source: "inter_import" },
          response_payload: payload,
          idempotency_key: `inter-import:${input.externalId}`
        })
        .select("id")
        .single();
      if (error || !inserted?.id) throw new Error(error?.message || "Nao foi possivel importar a cobranca.");
      chargeId = inserted.id;
    }
  }

  await supabase
    .from("financial_entries")
    .update({ charge_id: chargeId, updated_by: input.actorId || null, updated_at: new Date().toISOString() })
    .eq("id", entry.id)
    .eq("company_id", input.companyId);

  const result = await applyInterChargePayload({
    companyId: input.companyId,
    chargeId,
    payload,
    source: "importacao",
    actorId: input.actorId
  });
  if (["solicitada", "emitida", "registrada", "aguardando_pagamento", "vencida"].includes(result.status)) {
    await supabase
      .from("financial_entries")
      .update({
        status: result.status === "vencida" ? "vencido" : "aguardando_pagamento",
        updated_by: input.actorId || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", entry.id)
      .eq("company_id", input.companyId)
      .not("status", "in", "(recebido,conciliado,cancelado)");
  }

  return { chargeId, status: result.status };
}

async function chargeContext(companyId: string, chargeId: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("boleto_charges")
    .select(`
      id,company_id,financial_entry_id,external_id,status,idempotency_key,
      financial_entries(id,client_id,description,due_date,net_amount,clients(id,legal_name,document,financial_email,fiscal_email,address))
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

    const address = await resolvePayerAddress(companyId, client);
    const result = await createInterCharge({
      entryId: clean(entry.id),
      dueDate: clean(entry.due_date),
      amountCents: Math.round(Number(entry.net_amount) * 100),
      payerDocument: clean(client.document),
      payerName: clean(client.legal_name),
      payerEmail: clean(client.financial_email || client.fiscal_email),
      payerAddress: address,
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

export async function cancelInterChargesForFinancialEntry(input: {
  companyId: string;
  entryId: string;
  reason: string;
  actorId?: string | null;
}) {
  const supabase = createServiceClient();
  const { data: entry } = await supabase
    .from("financial_entries")
    .select("charge_id")
    .eq("id", input.entryId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  const chargeFilter = [
    `financial_entry_id.eq.${input.entryId}`,
    entry?.charge_id ? `id.eq.${entry.charge_id}` : null
  ].filter(Boolean).join(",");
  const { data: charges, error } = await supabase
    .from("boleto_charges")
    .select("id,status,external_id")
    .eq("company_id", input.companyId)
    .or(chargeFilter);
  if (error) throw new Error(error.message || "Nao foi possivel localizar a cobranca vinculada.");

  const activeCharges = (charges || []).filter((charge) => charge.status !== "cancelada");
  if (activeCharges.some((charge) => ["paga", "conciliada"].includes(String(charge.status)))) {
    throw new Error("O boleto ja foi pago ou conciliado e nao pode ser cancelado automaticamente.");
  }

  let cancelled = 0;
  for (const charge of activeCharges) {
    if (charge.external_id) {
      await cancelStoredInterCharge(input.companyId, charge.id, input.reason, input.actorId);
    } else {
      const payload = {
        motivoCancelamento: input.reason,
        canceladoLocalmente: true,
        dataHoraSituacao: new Date().toISOString()
      };
      await applyInterChargePayload({
        companyId: input.companyId,
        chargeId: charge.id,
        payload,
        source: "cancelamento",
        actorId: input.actorId
      });
    }
    cancelled += 1;
  }

  return { cancelled };
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
