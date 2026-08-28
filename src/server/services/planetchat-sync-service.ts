import {
  fetchPlanetChatAttendantMetrics,
  fetchPlanetChatCustomerServices,
  type PlanetChatAttendantMetric,
  type PlanetChatCustomerService,
  type PlanetChatEvent,
  type PlanetChatMessage
} from "@/lib/integrations/planetchat-client";
import { normalizePlanetChatPhone } from "@/domains/support/planetchat";
import { loadActivePlanetChatCredentials } from "@/lib/integrations/planetchat-credentials";
import { createServiceClient } from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;
type ClientRow = {
  id: string;
  legal_name: string;
  fiscal_email: string | null;
  financial_email: string | null;
  phone: string | null;
};
type ContactRow = { client_id: string; email: string | null; phone: string | null };
type ContractRow = { id: string; client_id: string; starts_at: string; created_at: string };
type PreviousOrder = {
  id: string;
  external_id: string;
  match_status: string;
  client_id: string | null;
  contract_id: string | null;
};

const statusLabels: Record<number, string> = {
  1: "bot",
  2: "fila",
  3: "em_atendimento",
  4: "encerrado",
  5: "expirado",
  6: "template",
  7: "agendado",
  8: "template_bot",
  9: "bloqueado"
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function optionalString(value: unknown) {
  return stringValue(value) || null;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalDate(value: unknown) {
  const text = stringValue(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function secondsBetween(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const seconds = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function normalizeEmail(value: unknown) {
  return stringValue(value).toLocaleLowerCase("pt-BR");
}

function eventFirstAttendedAt(events: PlanetChatEvent[]) {
  return events
    .filter((event) => stringValue(event.action) === "ATTENDANT_STARTED")
    .map((event) => optionalDate(event.createdAt))
    .filter((value): value is string => Boolean(value))
    .sort()[0] || null;
}

function messageList(item: PlanetChatCustomerService) {
  const direct = Array.isArray(item.messages) ? item.messages : [];
  if (direct.length) return direct;
  const chat = record(item.chat);
  return array(chat.messages) as PlanetChatMessage[];
}

function buildClientIndexes(clients: ClientRow[], contacts: ContactRow[]) {
  const phones = new Map<string, Set<string>>();
  const emails = new Map<string, Set<string>>();

  function add(index: Map<string, Set<string>>, key: string, clientId: string) {
    if (!key) return;
    const ids = index.get(key) || new Set<string>();
    ids.add(clientId);
    index.set(key, ids);
  }

  clients.forEach((client) => {
    add(phones, normalizePlanetChatPhone(client.phone), client.id);
    add(emails, normalizeEmail(client.fiscal_email), client.id);
    add(emails, normalizeEmail(client.financial_email), client.id);
  });
  contacts.forEach((contact) => {
    add(phones, normalizePlanetChatPhone(contact.phone), contact.client_id);
    add(emails, normalizeEmail(contact.email), contact.client_id);
  });
  return { phones, emails };
}

function matchClient(
  item: PlanetChatCustomerService,
  indexes: ReturnType<typeof buildClientIndexes>
) {
  const chat = record(item.chat);
  const contact = record(chat.contact);
  const phoneCandidates = [contact.phone, chat.source, chat.identifier]
    .map(normalizePlanetChatPhone)
    .filter(Boolean);
  const emailCandidates = [contact.email].map(normalizeEmail).filter(Boolean);
  const matches = new Set<string>();
  phoneCandidates.forEach((phone) => indexes.phones.get(phone)?.forEach((id) => matches.add(id)));
  emailCandidates.forEach((email) => indexes.emails.get(email)?.forEach((id) => matches.add(id)));
  return [...matches];
}

function resolveContract(clientId: string | null, contractsByClient: Map<string, ContractRow[]>) {
  if (!clientId) return { contractId: null, ambiguous: false };
  const contracts = contractsByClient.get(clientId) || [];
  if (contracts.length === 1) return { contractId: contracts[0].id, ambiguous: false };
  return { contractId: null, ambiguous: contracts.length > 1 };
}

function contactName(item: PlanetChatCustomerService) {
  const chat = record(item.chat);
  const contact = record(chat.contact);
  const fullName = [stringValue(contact.firstName), stringValue(contact.lastName)].filter(Boolean).join(" ");
  return fullName || stringValue(chat.sourceName) || null;
}

function orderPayload(
  companyId: string,
  item: PlanetChatCustomerService,
  indexes: ReturnType<typeof buildClientIndexes>,
  contractsByClient: Map<string, ContractRow[]>,
  previous?: PreviousOrder
) {
  const chat = record(item.chat);
  const contact = record(chat.contact);
  const channel = record(chat.chatChannel);
  const serviceQueue = record(chat.serviceQueue);
  const user = record(item.user);
  const queue = record(item.queue);
  const events = Array.isArray(item.events) ? item.events : [];
  const startedAt = optionalDate(item.startDate);
  const queuedAt = optionalDate(item.queueDate);
  const endedAt = optionalDate(item.endDate);
  const firstAttendedAt = optionalDate(item.firstAttendedAt) || eventFirstAttendedAt(events);
  const matches = matchClient(item, indexes);
  let clientId = matches.length === 1 ? matches[0] : null;
  let contractId: string | null = null;
  let matchStatus = matches.length > 1 ? "ambiguo" : "nao_vinculado";

  if (clientId) {
    const contract = resolveContract(clientId, contractsByClient);
    contractId = contract.contractId;
    matchStatus = contractId ? "vinculado" : contract.ambiguous ? "ambiguo" : "cliente_vinculado";
  }
  if (previous?.match_status === "manual") {
    clientId = previous.client_id;
    contractId = previous.contract_id;
    matchStatus = "manual";
  }

  const statusCode = optionalNumber(item.status);
  return {
    company_id: companyId,
    client_id: clientId,
    contract_id: contractId,
    provider: "planetchat",
    external_id: stringValue(item.id),
    protocol: optionalString(item.protocol),
    status_code: statusCode,
    status_label: statusCode === null ? "desconhecido" : statusLabels[statusCode] || `status_${statusCode}`,
    chat_id: optionalString(chat.id),
    contact_id: optionalString(contact.id),
    contact_name: contactName(item),
    contact_email: optionalString(contact.email),
    contact_phone: optionalString(contact.phone || chat.source),
    source: optionalString(chat.source),
    source_name: optionalString(chat.sourceName),
    identifier: optionalString(chat.identifier),
    channel_id: optionalString(channel.id),
    channel_name: optionalString(channel.name),
    channel_type: optionalString(channel.type),
    queue_id: optionalString(queue.id || serviceQueue.id),
    queue_name: optionalString(queue.name || serviceQueue.name),
    service_group_id: optionalString(queue.idServiceGroup),
    attendant_id: optionalString(user.id),
    attendant_name: optionalString(user.name),
    attendant_email: optionalString(user.email),
    started_at: startedAt,
    queued_at: queuedAt,
    first_attended_at: firstAttendedAt,
    ended_at: endedAt,
    duration_seconds: secondsBetween(startedAt, endedAt),
    wait_seconds: secondsBetween(queuedAt, firstAttendedAt),
    service_seconds: secondsBetween(firstAttendedAt, endedAt),
    avg_client_response_seconds: optionalNumber(item.avgClientResponseTime),
    avg_agent_response_seconds: optionalNumber(item.avgAgentResponseTime),
    survey_score: optionalNumber(item.surveyScore),
    template: item.template === true,
    has_alert_words: item.hasAlertWords === true,
    labels: array(chat.labels),
    qualification_response: item.qualificationResponse ?? {},
    raw_payload: item,
    match_status: matchStatus,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function metricPayload(companyId: string, metric: PlanetChatAttendantMetric, periodStart: string, periodEnd: string) {
  const sent = record(metric.sentMessagesInfo);
  return {
    company_id: companyId,
    external_user_id: stringValue(metric.userId) || `nome:${stringValue(metric.userName)}`,
    user_name: stringValue(metric.userName) || "Atendente nao identificado",
    period_start: periodStart,
    period_end: periodEnd,
    total_customer_services: optionalNumber(metric.totalCustomerServices) || 0,
    closed_customer_services: optionalNumber(metric.closedCustomerServices) || 0,
    average_survey_score: optionalNumber(metric.averageSurveyScore),
    answered_surveys: optionalNumber(metric.answeredSurveys) || 0,
    total_messages: optionalNumber(metric.totalMessages) || 0,
    received_messages: optionalNumber(metric.receivedMessages) || 0,
    sent_messages_total: optionalNumber(sent.total) || 0,
    sent_messages_error: optionalNumber(sent.error) || 0,
    sent_messages_sent: optionalNumber(sent.sent) || 0,
    sent_messages_delivered: optionalNumber(sent.delivered) || 0,
    sent_messages_read: optionalNumber(sent.read) || 0,
    tmu_seconds: optionalNumber(metric.tmu),
    tmia_seconds: optionalNumber(metric.tmia),
    tma_seconds: optionalNumber(metric.tma),
    raw_payload: metric,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function chunks<T>(items: T[], size = 100) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function fetchAllRows<T>(loadPage: (from: number, to: number) => PageResult<T>) {
  const output: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await loadPage(from, from + size - 1);
    if (error) throw new Error(error.message);
    const rows = data || [];
    output.push(...rows);
    if (rows.length < size) break;
  }
  return output;
}

export type PlanetChatSyncResult = {
  runId: string;
  supportOrders: number;
  events: number;
  messages: number;
  metrics: number;
  matchedClients: number;
  matchedContracts: number;
  warning?: string;
};

export async function syncPlanetChat(input: {
  companyId: string;
  requestedBy: string;
  periodStart: string;
  periodEnd: string;
}): Promise<PlanetChatSyncResult> {
  const service = createServiceClient();
  const { data: run, error: runError } = await service.from("planetchat_sync_runs").insert({
    company_id: input.companyId,
    requested_by: input.requestedBy,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    status: "executando"
  }).select("id").single();
  if (runError || !run?.id) throw new Error(`Nao foi possivel iniciar a sincronizacao: ${runError?.message || "registro ausente"}`);

  try {
    const credentials = await loadActivePlanetChatCredentials(input.companyId);
    const [supportItems, clients, rawContacts, contracts] = await Promise.all([
      fetchPlanetChatCustomerServices(credentials, input.periodStart, input.periodEnd),
      fetchAllRows<ClientRow>((from, to) => service.from("clients")
        .select("id,legal_name,fiscal_email,financial_email,phone")
        .eq("company_id", input.companyId)
        .range(from, to)),
      fetchAllRows<ContactRow>((from, to) => service.from("client_contacts")
        .select("client_id,email,phone,clients!inner(company_id)")
        .eq("clients.company_id", input.companyId)
        .range(from, to) as unknown as PageResult<ContactRow>),
      fetchAllRows<ContractRow>((from, to) => service.from("contracts")
        .select("id,client_id,starts_at,created_at")
        .eq("company_id", input.companyId)
        .eq("status", "ativo")
        .range(from, to))
    ]);
    const contacts = rawContacts.map((item) => ({
      client_id: String(item.client_id),
      email: item.email ? String(item.email) : null,
      phone: item.phone ? String(item.phone) : null
    })) as ContactRow[];
    const validItems = supportItems.filter((item) => stringValue(item.id));
    const previousRows: PreviousOrder[] = [];
    for (const batch of chunks(validItems.map((item) => stringValue(item.id)))) {
      const { data, error } = await service.from("support_orders")
        .select("id,external_id,match_status,client_id,contract_id")
        .eq("company_id", input.companyId)
        .eq("provider", "planetchat")
        .in("external_id", batch);
      if (error) throw new Error(`Falha ao carregar atendimentos anteriores: ${error.message}`);
      previousRows.push(...((data || []) as PreviousOrder[]));
    }
    const previousByExternalId = new Map(previousRows.map((item) => [item.external_id, item]));
    const contractsByClient = new Map<string, ContractRow[]>();
    contracts.forEach((contract) => {
      const list = contractsByClient.get(contract.client_id) || [];
      list.push(contract);
      contractsByClient.set(contract.client_id, list);
    });
    const indexes = buildClientIndexes(clients, contacts);
    const orderRows = validItems.map((item) => orderPayload(
      input.companyId,
      item,
      indexes,
      contractsByClient,
      previousByExternalId.get(stringValue(item.id))
    ));

    const storedOrders: Array<{ id: string; external_id: string }> = [];
    for (const batch of chunks(orderRows)) {
      const { data, error } = await service.from("support_orders").upsert(batch, {
        onConflict: "company_id,provider,external_id"
      }).select("id,external_id");
      if (error) throw new Error(`Falha ao armazenar atendimentos: ${error.message}`);
      storedOrders.push(...(data || []));
    }
    const orderIdByExternalId = new Map(storedOrders.map((item) => [String(item.external_id), String(item.id)]));

    const eventRows: JsonRecord[] = [];
    const messageRows: JsonRecord[] = [];
    validItems.forEach((item) => {
      const externalId = stringValue(item.id);
      const supportOrderId = orderIdByExternalId.get(externalId);
      if (!supportOrderId) return;
      (Array.isArray(item.events) ? item.events : []).forEach((event, index) => {
        eventRows.push({
          company_id: input.companyId,
          support_order_id: supportOrderId,
          provider: "planetchat",
          external_id: stringValue(event.id) || `${externalId}:event:${stringValue(event.action)}:${stringValue(event.createdAt)}:${index}`,
          action: stringValue(event.action) || "EVENTO",
          occurred_at: optionalDate(event.createdAt),
          payload: event
        });
      });
      messageList(item).forEach((message, index) => {
        messageRows.push({
          company_id: input.companyId,
          support_order_id: supportOrderId,
          provider: "planetchat",
          external_id: stringValue(message.id || message.idExternal) || `${externalId}:message:${stringValue(message.createdAt)}:${index}`,
          external_customer_service_id: optionalString(message.idCustomerService || externalId),
          external_chat_id: optionalString(message.idChat),
          direction: optionalString(message.sentBy ? "saida" : "entrada"),
          message_type: optionalString(message.type),
          text_content: optionalString(message.text),
          delivery_status: optionalString(message.status),
          from_bot: message.fromBot === true,
          from_system: message.fromSystem === true,
          sent_by: optionalString(message.sentBy),
          sent_by_name: optionalString(message.sentByName),
          attachments: Array.isArray(message.attachments) ? message.attachments : [],
          sent_at: optionalDate(message.createdAt),
          payload: message
        });
      });
    });
    for (const batch of chunks(eventRows)) {
      const { error } = await service.from("support_order_events").upsert(batch, {
        onConflict: "support_order_id,provider,external_id"
      });
      if (error) throw new Error(`Falha ao armazenar eventos: ${error.message}`);
    }
    for (const batch of chunks(messageRows)) {
      const { error } = await service.from("support_order_messages").upsert(batch, {
        onConflict: "support_order_id,provider,external_id"
      });
      if (error) throw new Error(`Falha ao armazenar mensagens: ${error.message}`);
    }

    let metricRows: JsonRecord[] = [];
    let warning: string | undefined;
    try {
      const metrics = await fetchPlanetChatAttendantMetrics(credentials, input.periodStart, input.periodEnd);
      metricRows = metrics
        .filter((metric) => stringValue(metric.userId || metric.userName))
        .map((metric) => metricPayload(input.companyId, metric, input.periodStart, input.periodEnd));
      for (const batch of chunks(metricRows)) {
        const { error } = await service.from("planetchat_attendant_metrics").upsert(batch, {
          onConflict: "company_id,external_user_id,period_start,period_end"
        });
        if (error) throw new Error(error.message);
      }
    } catch (error) {
      warning = error instanceof Error
        ? `Atendimentos sincronizados; metricas de atendentes pendentes: ${error.message}`
        : "Atendimentos sincronizados; metricas de atendentes pendentes.";
    }

    const matchedClients = orderRows.filter((item) => item.client_id).length;
    const matchedContracts = orderRows.filter((item) => item.contract_id).length;
    const result: PlanetChatSyncResult = {
      runId: run.id,
      supportOrders: storedOrders.length,
      events: eventRows.length,
      messages: messageRows.length,
      metrics: metricRows.length,
      matchedClients,
      matchedContracts,
      warning
    };
    await service.from("planetchat_sync_runs").update({
      status: warning ? "parcial" : "concluido",
      support_orders_received: supportItems.length,
      support_orders_upserted: storedOrders.length,
      events_upserted: eventRows.length,
      messages_upserted: messageRows.length,
      metrics_upserted: metricRows.length,
      matched_clients: matchedClients,
      matched_contracts: matchedContracts,
      warning_message: warning || null,
      finished_at: new Date().toISOString()
    }).eq("id", run.id).eq("company_id", input.companyId);

    const { data: credential } = await service.from("api_credentials")
      .select("id,config_summary")
      .eq("company_id", input.companyId)
      .eq("provider", "planetchat")
      .eq("environment", "production")
      .maybeSingle();
    if (credential?.id) {
      await service.from("api_credentials").update({
        config_summary: {
          ...record(credential.config_summary),
          lastSyncAt: new Date().toISOString(),
          lastSyncFrom: input.periodStart,
          lastSyncTo: input.periodEnd
        },
        updated_at: new Date().toISOString()
      }).eq("id", credential.id).eq("company_id", input.companyId);
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Falha desconhecida na sincronizacao.";
    await service.from("planetchat_sync_runs").update({
      status: "erro",
      error_message: message,
      finished_at: new Date().toISOString()
    }).eq("id", run.id).eq("company_id", input.companyId);
    throw error;
  }
}
