export const PLAN_CODES = ["starter", "pro", "enterprise"] as const;

export type PlanCode = (typeof PLAN_CODES)[number];
export type PlanResource = "companies" | "users" | "clients" | "catalog_items" | "recurrences";
export type PlanFeature = "nfse" | "reports" | "imports" | "recurring_automation" | "api_integrations" | "multi_company";

export type PlanDefinition = {
  code: PlanCode;
  name: string;
  description: string;
  limits: Record<PlanResource, number | null>;
  features: Record<PlanFeature, boolean>;
};

export const PLAN_DEFINITIONS: Record<PlanCode, PlanDefinition> = {
  starter: {
    code: "starter",
    name: "Starter",
    description: "Operacao essencial para uma pequena empresa.",
    limits: { companies: 1, users: 5, clients: 1_000, catalog_items: 500, recurrences: 100 },
    features: { nfse: true, reports: true, imports: true, recurring_automation: false, api_integrations: false, multi_company: false }
  },
  pro: {
    code: "pro",
    name: "Pro",
    description: "Mais capacidade, automacoes e integracoes para empresas em crescimento.",
    limits: { companies: 3, users: 20, clients: 20_000, catalog_items: 5_000, recurrences: 2_000 },
    features: { nfse: true, reports: true, imports: true, recurring_automation: true, api_integrations: true, multi_company: true }
  },
  enterprise: {
    code: "enterprise",
    name: "Enterprise",
    description: "Capacidade personalizada e todos os recursos da plataforma.",
    limits: { companies: null, users: null, clients: null, catalog_items: null, recurrences: null },
    features: { nfse: true, reports: true, imports: true, recurring_automation: true, api_integrations: true, multi_company: true }
  }
};

export const PLAN_RESOURCE_LABELS: Record<PlanResource, string> = {
  companies: "Empresas",
  users: "Usuarios ativos",
  clients: "Clientes",
  catalog_items: "Produtos e servicos",
  recurrences: "Contratos e matriculas"
};

export const PLAN_FEATURE_LABELS: Record<PlanFeature, string> = {
  nfse: "Emissao de NFS-e",
  reports: "Relatorios e exportacoes",
  imports: "Importacoes de dados",
  recurring_automation: "Automacoes recorrentes",
  api_integrations: "Integracoes com APIs",
  multi_company: "Multiplas empresas"
};

export function isPlanCode(value: string): value is PlanCode {
  return PLAN_CODES.includes(value as PlanCode);
}

export function planDefinition(value: string | null | undefined) {
  return PLAN_DEFINITIONS[isPlanCode(String(value || "")) ? value as PlanCode : "starter"];
}

export function capacityAvailable(usage: number, limit: number | null) {
  return limit === null || usage < limit;
}

export function usagePercentage(usage: number, limit: number | null) {
  if (limit === null || limit <= 0) return 0;
  return Math.min(100, Math.round((usage / limit) * 100));
}

export function isPlanLimitError(error: { message?: string | null } | null | undefined) {
  return Boolean(error?.message?.includes("plan_limit:"));
}
