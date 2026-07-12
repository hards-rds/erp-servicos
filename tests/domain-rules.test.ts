import assert from "node:assert/strict";
import test from "node:test";
import { isValidCnpj, isValidCpf } from "../src/lib/validations/br-documents.ts";
import { dueDateForCompetence } from "../src/lib/dates/competence.ts";
import { generateRecurringEntry } from "../src/domains/contracts/recurrence.ts";
import { summarizeCashflow, assertPayableCanBeMarkedPaid } from "../src/domains/finance/cashflow.ts";
import { nfseIdempotencyKey, validateNfseDraft } from "../src/domains/fiscal/nfse.ts";
import { interChargeIdempotencyKey, validateChargeDraft } from "../src/domains/billing/inter.ts";
import { assertCannotChangeOwnElevation, can } from "../src/domains/users/permissions.ts";

test("valida documentos brasileiros", () => {
  assert.equal(isValidCpf("529.982.247-25"), true);
  assert.equal(isValidCpf("111.111.111-11"), false);
  assert.equal(isValidCnpj("04.252.011/0001-10"), true);
  assert.equal(isValidCnpj("00.000.000/0000-00"), false);
});

test("gera vencimento respeitando ultimo dia do mes", () => {
  assert.equal(dueDateForCompetence("2026-02", 31), "2026-02-28");
  assert.equal(dueDateForCompetence("2026-07", 10), "2026-07-10");
});

test("gera entrada recorrente idempotente por contrato, competencia e vencimento", () => {
  const entry = generateRecurringEntry({
    id: "contract-1",
    clientId: "client-1",
    serviceDescription: "Suporte mensal",
    recurringAmountCents: 350000,
    periodicity: "mensal",
    dueDay: 10,
    startsAt: "2026-01-01",
    status: "ativo",
    autoIssueNfse: true,
    autoGenerateCharge: true
  }, "2026-07");

  assert.equal(entry.idempotencyKey, "contract:contract-1:competence:2026-07:due:2026-07-10");
  assert.equal(entry.netAmountCents, 350000);
});

test("consolida fluxo de caixa previsto e realizado", () => {
  const summary = summarizeCashflow(
    [
      { id: "e1", competence: "2026-07", dueDate: "2026-07-10", netAmountCents: 100000, status: "recebido" },
      { id: "e2", competence: "2026-07", dueDate: "2026-07-20", netAmountCents: 50000, status: "previsto" },
      { id: "e3", competence: "2026-07", dueDate: "2026-07-22", netAmountCents: 30000, status: "cancelado" }
    ],
    [
      { id: "p1", competence: "2026-07", dueDate: "2026-07-12", amountCents: 40000, status: "pago" },
      { id: "p2", competence: "2026-07", dueDate: "2026-07-18", amountCents: 10000, status: "previsto" }
    ]
  );

  assert.equal(summary.projectedBalanceCents, 100000);
  assert.equal(summary.realizedBalanceCents, 60000);
});

test("saida paga exige data e valor", () => {
  assert.throws(() => assertPayableCanBeMarkedPaid({ amountCents: 0 }), /data de pagamento/);
});

test("valida NFS-e e chave idempotente", () => {
  assert.equal(nfseIdempotencyKey({ clientId: "c1", entryId: "e1", competence: "2026-07" }), "nfse:c1:e1:2026-07");
  assert.deepEqual(validateNfseDraft({
    clientId: "c1",
    entryId: "e1",
    competence: "2026-07",
    amountCents: 1000
  }), ["Codigo de servico obrigatorio.", "Municipio de incidencia obrigatorio."]);
});

test("valida cobranca Inter e idempotencia", () => {
  assert.equal(interChargeIdempotencyKey({ entryId: "e1", dueDate: "2026-07-10" }), "inter-charge:e1:2026-07-10");
  assert.deepEqual(validateChargeDraft({
    entryId: "",
    dueDate: "2026-07-10",
    amountCents: 0,
    payerDocument: ""
  }), [
    "Entrada financeira obrigatoria.",
    "Valor da cobranca deve ser maior que zero.",
    "Documento do pagador obrigatorio."
  ]);
});

test("aplica permissoes por grupo e bloqueia auto-elevacao", () => {
  assert.equal(can({ userId: "u1", role: "master", permissions: [] }, "fiscal:emitir"), true);
  assert.equal(can({ userId: "u1", role: "usuario", permissions: ["financeiro:conciliar"] }, "financeiro:conciliar"), true);
  assert.throws(() => assertCannotChangeOwnElevation("u1", "u1", ["usuarios:configurar"]), /propria permissao/);
});
