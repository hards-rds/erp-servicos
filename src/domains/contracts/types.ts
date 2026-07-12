export type ContractStatus = "rascunho" | "ativo" | "suspenso" | "encerrado";
export type Periodicity = "mensal" | "trimestral" | "semestral" | "anual";

export type Contract = {
  id: string;
  clientId: string;
  serviceDescription: string;
  recurringAmountCents: number;
  periodicity: Periodicity;
  dueDay: number;
  startsAt: string;
  endsAt?: string;
  status: ContractStatus;
  autoIssueNfse: boolean;
  autoGenerateCharge: boolean;
};

export type FinancialEntryDraft = {
  idempotencyKey: string;
  clientId: string;
  contractId: string;
  description: string;
  competence: string;
  dueDate: string;
  grossAmountCents: number;
  netAmountCents: number;
  status: "previsto";
};
