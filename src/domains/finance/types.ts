export type FinancialEntryStatus =
  | "previsto"
  | "emitido"
  | "aguardando_pagamento"
  | "recebido"
  | "vencido"
  | "cancelado"
  | "conciliado";

export type PayableStatus = "previsto" | "aprovado" | "pago" | "vencido" | "cancelado" | "conciliado";

export type FinancialEntry = {
  id: string;
  competence: string;
  dueDate: string;
  receivedAt?: string;
  netAmountCents: number;
  status: FinancialEntryStatus;
};

export type Payable = {
  id: string;
  competence: string;
  dueDate: string;
  paidAt?: string;
  amountCents: number;
  status: PayableStatus;
};
