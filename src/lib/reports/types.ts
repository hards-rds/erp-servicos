export const REPORT_KEYS = ["financeiro", "saidas", "comissoes", "vendas", "estoque", "servicos", "clientes", "fiscal"] as const;

export type ReportKey = (typeof REPORT_KEYS)[number];

export type ReportFilters = {
  report: ReportKey;
  from: string;
  to: string;
  status: string;
  search: string;
};

export type ReportColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
};

export type ReportMetric = {
  label: string;
  value: string;
  detail?: string;
};

export type ReportResult = {
  title: string;
  description: string;
  dateFieldLabel: string;
  columns: ReportColumn[];
  rows: Array<Record<string, string>>;
  metrics: ReportMetric[];
};

export const reportLabels: Record<ReportKey, string> = {
  financeiro: "Entradas",
  saidas: "Saidas",
  comissoes: "Comissoes",
  vendas: "Vendas",
  estoque: "Estoque",
  servicos: "Servicos",
  clientes: "Clientes",
  fiscal: "Fiscal"
};

export const reportStatuses: Record<ReportKey, Array<{ value: string; label: string }>> = {
  financeiro: [
    { value: "previsto", label: "Previsto" },
    { value: "emitido", label: "Emitido" },
    { value: "aguardando_pagamento", label: "Aguardando pagamento" },
    { value: "recebido", label: "Recebido" },
    { value: "vencido", label: "Vencido" },
    { value: "cancelado", label: "Cancelado" },
    { value: "conciliado", label: "Conciliado" }
  ],
  saidas: [
    { value: "previsto", label: "Previsto" },
    { value: "aprovado", label: "Aprovado" },
    { value: "pago", label: "Pago" },
    { value: "vencido", label: "Vencido" },
    { value: "cancelado", label: "Cancelado" },
    { value: "conciliado", label: "Conciliado" }
  ],
  comissoes: [
    { value: "pendente", label: "Pendente" },
    { value: "aprovada", label: "Aprovada" },
    { value: "paga", label: "Paga" },
    { value: "cancelada", label: "Cancelada" }
  ],
  vendas: [
    { value: "aberta", label: "Aberta" },
    { value: "faturada", label: "Faturada" },
    { value: "recebida", label: "Recebida" },
    { value: "cancelada", label: "Cancelada" }
  ],
  estoque: [
    { value: "ativo", label: "Ativo" },
    { value: "inativo", label: "Inativo" },
    { value: "baixo", label: "Estoque baixo" }
  ],
  servicos: [
    { value: "rascunho", label: "Rascunho" },
    { value: "em_andamento", label: "Em andamento" },
    { value: "concluido", label: "Concluido" },
    { value: "faturado", label: "Faturado" },
    { value: "cancelado", label: "Cancelado" }
  ],
  clientes: [
    { value: "ativo", label: "Ativo" },
    { value: "inativo", label: "Inativo" }
  ],
  fiscal: [
    { value: "rascunho", label: "Rascunho" },
    { value: "validada", label: "Validada" },
    { value: "enfileirada", label: "Enfileirada" },
    { value: "enviada", label: "Enviada" },
    { value: "autorizada", label: "Autorizada" },
    { value: "rejeitada", label: "Rejeitada" },
    { value: "cancelada", label: "Cancelada" },
    { value: "erro_integracao", label: "Erro de integracao" }
  ]
};

export function parseReportFilters(input: Record<string, string | undefined>): ReportFilters {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const report = REPORT_KEYS.includes(input.report as ReportKey) ? input.report as ReportKey : "financeiro";

  return {
    report,
    from: /^\d{4}-\d{2}-\d{2}$/.test(input.from || "") ? input.from! : iso(firstDay),
    to: /^\d{4}-\d{2}-\d{2}$/.test(input.to || "") ? input.to! : iso(lastDay),
    status: String(input.status || "").trim(),
    search: String(input.search || "").trim().slice(0, 100)
  };
}
