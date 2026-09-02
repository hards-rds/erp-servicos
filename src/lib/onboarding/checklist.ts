export type OnboardingSegment = "tecnologia" | "otica" | "escola_futebol" | "transportadora" | "generico";

export type OnboardingSignals = {
  companyIdentity: boolean;
  accessConfigured: boolean;
  clients: number;
  services: number;
  products: number;
  contracts: number;
  financialEntries: number;
  schoolAthletes: number;
  schoolClasses: number;
  schoolEnrollments: number;
  transportVehicles: number;
  transportDrivers: number;
  transportTrips: number;
  fiscalConfigured: boolean;
  emailConfigured: boolean;
};

export type OnboardingStep = {
  id: string;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  complete: boolean;
  optional?: boolean;
};

const commonSteps = (signals: OnboardingSignals): OnboardingStep[] => [
  {
    id: "company",
    title: "Dados da empresa",
    detail: "Nome empresarial, documento e segmento",
    href: "/configuracoes/gerais",
    actionLabel: "Revisar dados",
    complete: signals.companyIdentity
  },
  {
    id: "access",
    title: "Usuarios e acessos",
    detail: "Usuario responsavel e grupos de permissao",
    href: "/configuracoes/usuarios",
    actionLabel: "Gerenciar acessos",
    complete: signals.accessConfigured
  },
  {
    id: "clients",
    title: "Base de clientes",
    detail: signals.clients ? `${signals.clients} cliente(s) cadastrado(s)` : "Nenhum cliente cadastrado",
    href: "/cadastros/clientes",
    actionLabel: "Abrir clientes",
    complete: signals.clients > 0
  }
];

const fiscalSteps = (signals: OnboardingSignals): OnboardingStep[] => [
  {
    id: "fiscal",
    title: "Emissao fiscal",
    detail: "Dados fiscais e certificado digital",
    href: "/configuracoes/certificado-digital",
    actionLabel: "Configurar fiscal",
    complete: signals.fiscalConfigured,
    optional: true
  },
  {
    id: "email",
    title: "E-mail transacional",
    detail: "Remetente usado nos documentos enviados",
    href: "/configuracoes/emails",
    actionLabel: "Configurar e-mail",
    complete: signals.emailConfigured,
    optional: true
  }
];

export function buildOnboardingSteps(segment: OnboardingSegment, signals: OnboardingSignals): OnboardingStep[] {
  const common = commonSteps(signals);

  if (segment === "tecnologia") {
    return [
      ...common,
      {
        id: "services",
        title: "Catalogo de servicos",
        detail: signals.services ? `${signals.services} servico(s) cadastrado(s)` : "Nenhum servico cadastrado",
        href: "/cadastros/servicos",
        actionLabel: "Abrir servicos",
        complete: signals.services > 0
      },
      {
        id: "contracts",
        title: "Contratos recorrentes",
        detail: signals.contracts ? `${signals.contracts} contrato(s) cadastrado(s)` : "Nenhum contrato cadastrado",
        href: "/cadastros/contratos",
        actionLabel: "Abrir contratos",
        complete: signals.contracts > 0
      },
      ...fiscalSteps(signals)
    ];
  }

  if (segment === "otica") {
    return [
      ...common,
      {
        id: "products",
        title: "Produtos e estoque",
        detail: signals.products ? `${signals.products} produto(s) cadastrado(s)` : "Nenhum produto cadastrado",
        href: "/operacao/estoque",
        actionLabel: "Abrir estoque",
        complete: signals.products > 0
      },
      {
        id: "services",
        title: "Servicos da otica",
        detail: signals.services ? `${signals.services} servico(s) cadastrado(s)` : "Nenhum servico cadastrado",
        href: "/cadastros/servicos",
        actionLabel: "Abrir servicos",
        complete: signals.services > 0
      },
      ...fiscalSteps(signals)
    ];
  }

  if (segment === "escola_futebol") {
    return [
      ...common,
      {
        id: "classes",
        title: "Turmas",
        detail: signals.schoolClasses ? `${signals.schoolClasses} turma(s) cadastrada(s)` : "Nenhuma turma cadastrada",
        href: "/escola/turmas",
        actionLabel: "Abrir turmas",
        complete: signals.schoolClasses > 0
      },
      {
        id: "athletes",
        title: "Atletas",
        detail: signals.schoolAthletes ? `${signals.schoolAthletes} atleta(s) cadastrado(s)` : "Nenhum atleta cadastrado",
        href: "/escola/atletas",
        actionLabel: "Abrir atletas",
        complete: signals.schoolAthletes > 0
      },
      {
        id: "enrollments",
        title: "Matriculas",
        detail: signals.schoolEnrollments ? `${signals.schoolEnrollments} matricula(s) cadastrada(s)` : "Nenhuma matricula cadastrada",
        href: "/escola/matriculas",
        actionLabel: "Abrir matriculas",
        complete: signals.schoolEnrollments > 0
      },
      {
        id: "financial",
        title: "Primeira mensalidade",
        detail: signals.financialEntries ? "Fluxo financeiro iniciado" : "Nenhuma mensalidade gerada",
        href: "/financeiro/entradas",
        actionLabel: "Abrir entradas",
        complete: signals.financialEntries > 0
      }
    ];
  }

  if (segment === "transportadora") {
    return [
      ...common,
      { id: "fleet", title: "Frota", detail: signals.transportVehicles ? `${signals.transportVehicles} veiculo(s) cadastrado(s)` : "Nenhum veiculo cadastrado", href: "/transporte/frota", actionLabel: "Abrir frota", complete: signals.transportVehicles > 0 },
      { id: "drivers", title: "Motoristas", detail: signals.transportDrivers ? `${signals.transportDrivers} motorista(s) cadastrado(s)` : "Nenhum motorista cadastrado", href: "/transporte/motoristas", actionLabel: "Abrir motoristas", complete: signals.transportDrivers > 0 },
      { id: "trips", title: "Primeira viagem", detail: signals.transportTrips ? `${signals.transportTrips} viagem(ns) cadastrada(s)` : "Nenhuma viagem cadastrada", href: "/transporte/viagens", actionLabel: "Abrir viagens", complete: signals.transportTrips > 0 },
      ...fiscalSteps(signals)
    ];
  }

  return [
    ...common,
    {
      id: "services",
      title: "Catalogo de servicos",
      detail: signals.services ? `${signals.services} servico(s) cadastrado(s)` : "Nenhum servico cadastrado",
      href: "/cadastros/servicos",
      actionLabel: "Abrir servicos",
      complete: signals.services > 0
    },
    {
      id: "financial",
      title: "Primeiro lancamento",
      detail: signals.financialEntries ? "Fluxo financeiro iniciado" : "Nenhum lancamento gerado",
      href: "/financeiro/entradas",
      actionLabel: "Abrir entradas",
      complete: signals.financialEntries > 0
    },
    ...fiscalSteps(signals)
  ];
}

export function onboardingProgress(steps: OnboardingStep[]) {
  const required = steps.filter((step) => !step.optional);
  const completed = required.filter((step) => step.complete).length;
  return {
    completed,
    total: required.length,
    percent: required.length ? Math.round((completed / required.length) * 100) : 100
  };
}
