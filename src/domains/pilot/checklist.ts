export type PilotSegment = "tecnologia" | "otica" | "escola_futebol" | "generico";

export type PilotCheckStatus = "pending" | "passed" | "failed" | "not_applicable";

export type PilotCheckDefinition = {
  key: string;
  category: string;
  title: string;
  description: string;
  required: boolean;
};

export type PilotCheckResult = Pick<PilotCheckDefinition, "key" | "required"> & {
  status: PilotCheckStatus;
};

const commonChecks: PilotCheckDefinition[] = [
  { key: "tenant_isolation", category: "Seguranca", title: "Isolamento do tenant", description: "Confirmar que usuarios nao visualizam dados de outro tenant.", required: true },
  { key: "access_profiles", category: "Seguranca", title: "Perfis e permissoes", description: "Validar acessos de master, administrador e operador.", required: true },
  { key: "onboarding", category: "Implantacao", title: "Onboarding concluido", description: "Revisar empresa, usuarios e dados iniciais do segmento.", required: true },
  { key: "client_flow", category: "Cadastros", title: "Fluxo de clientes", description: "Criar, editar, buscar e consultar um cliente real de teste.", required: true },
  { key: "financial_flow", category: "Financeiro", title: "Fluxo financeiro", description: "Gerar entrada e saida, dar baixa e conferir o fluxo de caixa.", required: true },
  { key: "reports", category: "Relatorios", title: "Relatorios e exportacao", description: "Conferir totais, filtros e arquivo exportado com o banco.", required: true },
  { key: "responsive_ui", category: "Experiencia", title: "Telas e responsividade", description: "Validar as rotinas principais em desktop e celular.", required: true },
  { key: "backup_restore", category: "Operacao", title: "Backup e restauracao", description: "Confirmar backup recente e procedimento de restauracao.", required: true }
];

const segmentChecks: Record<PilotSegment, PilotCheckDefinition[]> = {
  tecnologia: [
    { key: "technology_contract", category: "Tecnologia", title: "Contrato recorrente", description: "Cadastrar contrato e gerar a competencia sem duplicidade.", required: true },
    { key: "technology_financial_only", category: "Tecnologia", title: "Financeiro sem NFS-e", description: "Gerar financeiro sem impedir emissao fiscal posterior.", required: true },
    { key: "technology_nfse", category: "Tecnologia", title: "NFS-e completa", description: "Enfileirar, revisar, emitir e baixar XML e DANFSE.", required: false },
    { key: "technology_planetchat", category: "Tecnologia", title: "PlanetChat", description: "Sincronizar chamados, historico e metricas quando contratado.", required: false },
    { key: "technology_inter", category: "Tecnologia", title: "Banco Inter", description: "Gerar e acompanhar cobranca quando a integracao estiver ativa.", required: false }
  ],
  otica: [
    { key: "optical_import", category: "Otica", title: "Importacao de pacientes", description: "Importar clientes e receitas sem duplicar registros.", required: true },
    { key: "optical_history", category: "Otica", title: "Historico optico", description: "Cadastrar nova receita preservando o historico anterior.", required: true },
    { key: "optical_sale", category: "Otica", title: "Venda e estoque", description: "Realizar venda e conferir estoque, financeiro e comissao.", required: true }
  ],
  escola_futebol: [
    { key: "school_registration", category: "Escola", title: "Atleta e responsavel", description: "Cadastrar atleta com os dados do responsavel.", required: true },
    { key: "school_class", category: "Escola", title: "Turma e matricula", description: "Vincular atleta a turma e validar a matricula.", required: true },
    { key: "school_monthly_fee", category: "Escola", title: "Mensalidade", description: "Gerar mensalidade sem duplicidade e registrar recebimento.", required: true },
    { key: "school_attendance", category: "Escola", title: "Presenca e historico", description: "Registrar presenca e consultar o historico do aluno.", required: true }
  ],
  generico: [
    { key: "generic_sale", category: "Operacao", title: "Venda ou servico", description: "Executar a rotina principal e conferir seus reflexos financeiros.", required: true }
  ]
};

export function buildPilotChecklist(segments: PilotSegment[]) {
  const normalized = segments.length ? segments : ["generico" as const];
  const checks = [...commonChecks, ...normalized.flatMap((segment) => segmentChecks[segment] || segmentChecks.generico)];
  return Array.from(new Map(checks.map((check) => [check.key, check])).values());
}

export function pilotProgress(checks: PilotCheckResult[]) {
  const required = checks.filter((check) => check.required);
  const passed = required.filter((check) => check.status === "passed").length;
  const failed = required.filter((check) => check.status === "failed").length;
  const pending = required.length - passed;
  return {
    passed,
    failed,
    pending,
    total: required.length,
    percent: required.length ? Math.round((passed / required.length) * 100) : 100
  };
}

export function canApprovePilot(checks: PilotCheckResult[], automatedBlockers: number) {
  const progress = pilotProgress(checks);
  return progress.total > 0 && progress.pending === 0 && progress.failed === 0 && automatedBlockers === 0;
}
