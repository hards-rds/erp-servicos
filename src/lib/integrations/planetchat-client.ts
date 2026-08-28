import type { PlanetChatRuntimeCredentials } from "@/lib/integrations/planetchat-credentials";

const PLANETCHAT_API_BASE_URL = "https://api.planetchat.com.br";
const PAGE_LIMIT = 100;
const MAX_PAGES = 500;

export type PlanetChatEvent = {
  id?: string;
  action?: string;
  createdAt?: string;
  [key: string]: unknown;
};

export type PlanetChatMessage = {
  id?: string;
  idExternal?: string;
  idChat?: string;
  idCustomerService?: string;
  type?: string;
  text?: string;
  status?: string;
  fromBot?: boolean;
  fromSystem?: boolean;
  sentBy?: string;
  sentByName?: string;
  attachments?: unknown[];
  createdAt?: string;
  [key: string]: unknown;
};

export type PlanetChatCustomerService = {
  id?: string;
  protocol?: string;
  status?: number;
  startDate?: string;
  endDate?: string;
  queueDate?: string;
  firstAttendedAt?: string;
  avgClientResponseTime?: number;
  avgAgentResponseTime?: number;
  surveyScore?: number;
  template?: boolean;
  hasAlertWords?: boolean;
  chat?: Record<string, unknown>;
  user?: Record<string, unknown>;
  queue?: Record<string, unknown>;
  events?: PlanetChatEvent[];
  messages?: PlanetChatMessage[];
  qualificationResponse?: unknown;
  [key: string]: unknown;
};

export type PlanetChatAttendantMetric = {
  userId?: string;
  userName?: string;
  totalCustomerServices?: number;
  closedCustomerServices?: number;
  averageSurveyScore?: number;
  answeredSurveys?: number;
  totalMessages?: number;
  receivedMessages?: number;
  sentMessagesInfo?: Record<string, unknown>;
  tmu?: number;
  tmia?: number;
  tma?: number;
  [key: string]: unknown;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function readNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function requestJson(path: string, credentials: PlanetChatRuntimeCredentials, query: URLSearchParams) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(`${PLANETCHAT_API_BASE_URL}${path}?${query.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${credentials.token}`
      },
      cache: "no-store",
      signal: controller.signal
    });
    const text = await response.text();
    let payload: unknown = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { message: text.slice(0, 500) };
    }

    if (!response.ok) {
      const errorPayload = asRecord(payload);
      const message = String(errorPayload.message || errorPayload.error || `HTTP ${response.status}`);
      if (response.status === 401 || response.status === 403) {
        throw new Error(`PlanetChat recusou a autenticacao ou permissao: ${message}`);
      }
      throw new Error(`PlanetChat respondeu com erro: ${message}`);
    }
    return asRecord(payload);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Tempo limite excedido ao consultar a PlanetChat.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchPlanetChatCustomerServices(
  credentials: PlanetChatRuntimeCredentials,
  periodStart: string,
  periodEnd: string
) {
  const items: PlanetChatCustomerService[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const query = new URLSearchParams({
      mode: "report",
      startDateStart: periodStart,
      startDateEnd: periodEnd,
      page: String(page),
      limit: String(PAGE_LIMIT)
    });
    const payload = await requestJson("/customer_service", credentials, query);
    const pageItems = asArray<PlanetChatCustomerService>(payload.customerServiceList);
    items.push(...pageItems);
    const totalCount = readNumber(payload.totalCount);
    if (!pageItems.length || pageItems.length < PAGE_LIMIT || (totalCount > 0 && items.length >= totalCount)) break;
  }

  return items;
}

export async function fetchPlanetChatAttendantMetrics(
  credentials: PlanetChatRuntimeCredentials,
  periodStart: string,
  periodEnd: string
) {
  const items: PlanetChatAttendantMetric[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams({
      startDate: periodStart,
      endDate: periodEnd,
      page: String(page),
      limit: String(PAGE_LIMIT)
    });
    const payload = await requestJson("/customer_service/reports/attendants", credentials, query);
    const pageItems = asArray<PlanetChatAttendantMetric>(payload.data);
    items.push(...pageItems);
    const totalCount = readNumber(payload.totalCount);
    if (!pageItems.length || pageItems.length < PAGE_LIMIT || (totalCount > 0 && items.length >= totalCount)) break;
  }

  return items;
}

export async function testPlanetChatConnection(credentials: PlanetChatRuntimeCredentials) {
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const query = new URLSearchParams({
    mode: "report",
    startDateStart: start.toISOString(),
    startDateEnd: now.toISOString(),
    page: "1",
    limit: "1"
  });
  await requestJson("/customer_service", credentials, query);
}
