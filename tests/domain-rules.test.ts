import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { isValidCnpj, isValidCpf } from "../src/lib/validations/br-documents.ts";
import { dueDateForCompetence } from "../src/lib/dates/competence.ts";
import { generateRecurringEntry, isRecurringCompetenceDue } from "../src/domains/contracts/recurrence.ts";
import { summarizeCashflow, assertPayableCanBeMarkedPaid } from "../src/domains/finance/cashflow.ts";
import { nfseIdempotencyKey, validateNfseDraft } from "../src/domains/fiscal/nfse.ts";
import { buildDpsXml, interpretNfseResponse, mergeNfseFiscalData, validateDpsInput } from "../src/lib/integrations/nfse-national.ts";
import {
  buildCancellationXml,
  interpretCancellationResponse,
  validateCancellationInput
} from "../src/lib/integrations/nfse-cancellation.ts";
import {
  classifyInterConnectionError,
  interChargeIdempotencyKey,
  mapInterChargeStatus,
  validateChargeDraft
} from "../src/domains/billing/inter.ts";
import { assertCannotChangeOwnElevation, can } from "../src/domains/users/permissions.ts";
import { serviceDeletionBlock } from "../src/domains/services/deletion.ts";
import {
  assertCommissionTransition,
  calculateCommissionAmount,
  canTransitionCommission
} from "../src/domains/finance/commissions.ts";
import { selectCommissionRate } from "../src/domains/finance/commission-rules.ts";
import { calculateSaleAmounts, saleItemMovesStock } from "../src/domains/sales/items.ts";

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

test("respeita inicio, fim e periodicidade das competencias recorrentes", () => {
  const contract = {
    startsAt: "2026-02-15",
    endsAt: "2027-01-31",
    periodicity: "trimestral" as const,
    status: "ativo" as const
  };

  assert.equal(isRecurringCompetenceDue(contract, "2026-01"), false);
  assert.equal(isRecurringCompetenceDue(contract, "2026-02"), true);
  assert.equal(isRecurringCompetenceDue(contract, "2026-03"), false);
  assert.equal(isRecurringCompetenceDue(contract, "2026-05"), true);
  assert.equal(isRecurringCompetenceDue(contract, "2027-02"), false);
  assert.equal(isRecurringCompetenceDue({ ...contract, status: "suspenso" }, "2026-05"), false);
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
    ],
    [
      { commissionAmountCents: 5000, status: "pendente", payableId: null },
      { commissionAmountCents: 9000, status: "aprovada", payableId: "p2" },
      { commissionAmountCents: 3000, status: "cancelada", payableId: null }
    ]
  );

  assert.equal(summary.pendingCommissionExpenseCents, 5000);
  assert.equal(summary.expectedExpenseCents, 55000);
  assert.equal(summary.projectedBalanceCents, 95000);
  assert.equal(summary.realizedBalanceCents, 60000);
});

test("saida paga exige data e valor", () => {
  assert.throws(() => assertPayableCanBeMarkedPaid({ amountCents: 0 }), /data de pagamento/);
});

test("calcula comissao e controla seu fluxo de aprovacao", () => {
  assert.equal(calculateCommissionAmount(1175, 3.5), 41.13);
  assert.equal(canTransitionCommission("pendente", "aprovada"), true);
  assert.equal(canTransitionCommission("aprovada", "paga"), true);
  assert.equal(canTransitionCommission("paga", "cancelada"), false);
  assert.throws(() => assertCommissionTransition("pendente", "paga"), /Transicao/);
});

test("prioriza percentual especifico e usa o percentual padrao como alternativa", () => {
  const rules = [
    { source_type: "venda" as const, item_key: "*", rate_percent: 2 },
    { source_type: "venda" as const, item_key: "produto-1", rate_percent: 4.5 },
    { source_type: "servico" as const, item_key: "*", rate_percent: 3 },
    { source_type: "servico" as const, item_key: "consultoria", rate_percent: 8 }
  ];

  assert.equal(selectCommissionRate(rules, { sourceType: "venda", itemKey: "produto-1" }), 4.5);
  assert.equal(selectCommissionRate(rules, { sourceType: "venda", itemKey: "produto-2" }), 2);
  assert.equal(selectCommissionRate(rules, { sourceType: "servico", itemKey: "consultoria" }), 8);
  assert.equal(selectCommissionRate(rules, { sourceType: "servico", itemKey: "suporte" }), 3);
  assert.equal(selectCommissionRate([], { sourceType: "venda", itemKey: "produto-1" }), null);
});

test("calcula venda e movimenta estoque somente para produtos", () => {
  assert.deepEqual(calculateSaleAmounts(2, 175, 20), { grossAmount: 350, netAmount: 330 });
  assert.equal(saleItemMovesStock("produto"), true);
  assert.equal(saleItemMovesStock("servico_catalogo"), false);
  assert.equal(saleItemMovesStock("servico_avulso"), false);
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

test("separa emitente, tomador e servico ao montar a DPS", () => {
  assert.deepEqual(
    mergeNfseFiscalData(
      { serviceCode: "", provider: "nfse_nacional" },
      { serviceCode: "010701" }
    ),
    { serviceCode: "010701", provider: "nfse_nacional" }
  );

  const dps = buildDpsXml({
    documentId: "documento-1",
    company: {
      name: "Emitente",
      document: "04.252.011/0001-10",
      fiscal_settings: {
        cityCode: "3170206",
        series: "1",
        simpleNationalStatus: "3",
        simpleNationalAssessmentRegime: "1",
        federalTotalTaxRate: "13.45",
        stateTotalTaxRate: "0.00",
        municipalTotalTaxRate: "3.05",
        specialTaxRegime: "0"
      }
    },
    client: {
      legal_name: "Tomador pessoa fisica",
      document: "529.982.247-25",
      fiscal_email: null,
      phone: null,
      address: { cityCode: "3550308", zipCode: "01001000" }
    },
    entry: {
      id: "entrada-1",
      description: "Suporte tecnico",
      competence: "2026-08",
      net_amount: 100
    },
    fiscalData: {
      serviceCode: "010701",
      nbsCode: "123456789",
      ibsCbsCst: "000",
      ibsCbsTaxClass: "000001",
      ibsCbsOperationIndicator: "100101",
      ibsCbsFinalConsumer: false
    }
  });

  assert.match(dps.xml, /<CPF>52998224725<\/CPF>/);
  assert.match(dps.xml, /<DPS xmlns="http:\/\/www\.sped\.fazenda\.gov\.br\/nfse" versao="1.01">/);
  assert.match(dps.xml, /<infDPS Id="[^"]+">/);
  assert.doesNotMatch(dps.xml, /<infDPS[^>]+versao=/);
  assert.match(dps.xml, /<cLocEmi>3170206<\/cLocEmi>/);
  assert.match(dps.xml, /<cMun>3550308<\/cMun>/);
  assert.match(dps.xml, /<opSimpNac>3<\/opSimpNac>/);
  assert.match(dps.xml, /<regApTribSN>1<\/regApTribSN>/);
  assert.match(dps.xml, /<xDescServ>Suporte tecnico<\/xDescServ>\s*<cNBS>123456789<\/cNBS>/);
  assert.match(dps.xml, /<trib>[\s\S]*<tribMun>[\s\S]*<\/tribMun>[\s\S]*<totTrib>[\s\S]*<pTotTrib>[\s\S]*<pTotTribFed>13\.45<\/pTotTribFed>[\s\S]*<pTotTribEst>0\.00<\/pTotTribEst>[\s\S]*<pTotTribMun>3\.05<\/pTotTribMun>[\s\S]*<\/pTotTrib>[\s\S]*<\/totTrib>[\s\S]*<\/trib>/);
  assert.doesNotMatch(dps.xml, /<indTotTrib>/);
  assert.doesNotMatch(dps.xml, /<pTotTribSN>/);
  assert.match(dps.xml, /<\/valores>\s*<IBSCBS>[\s\S]*<CST>000<\/CST>[\s\S]*<cClassTrib>000001<\/cClassTrib>[\s\S]*<\/IBSCBS>\s*<\/infDPS>/);
});

test("valida o NBS da DPS com nove digitos quando informado", () => {
  const input = {
    documentId: "documento-nbs",
    company: {
      name: "Emitente",
      document: "04.252.011/0001-10",
      fiscal_settings: {
        cityCode: "3170206",
        simpleNationalStatus: "3",
        simpleNationalAssessmentRegime: "1",
        federalTotalTaxRate: "13.45",
        stateTotalTaxRate: "0",
        municipalTotalTaxRate: "3.05"
      }
    },
    client: {
      legal_name: "Tomador",
      document: "529.982.247-25",
      fiscal_email: null,
      phone: null,
      address: null
    },
    entry: {
      id: "entrada-nbs",
      description: "Servico",
      competence: "2026-08",
      net_amount: 100
    },
    fiscalData: { serviceCode: "010701", nbsCode: "123" }
  };

  assert.match(validateDpsInput(input).errors.join(" "), /NBS deve conter 9 digitos/);
});

test("preserva a rejeicao detalhada devolvida pela SEFIN", () => {
  const result = interpretNfseResponse({
    idDPS: "DPS123",
    erros: [{ Codigo: "E1200", Descricao: "Certificado de transmissao invalido" }]
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "rejeitada");
  assert.equal(result.message, "E1200 - Certificado de transmissao invalido");
});

test("recupera numero e chave oficiais do XML autorizado da SEFIN", () => {
  const accessKey = "12345678901234567890123456789012345678901234567890";
  const xml = `<NFSe><infNFSe Id="NFS${accessKey}"><nNFSe>987</nNFSe></infNFSe></NFSe>`;
  const result = interpretNfseResponse({
    retorno: { nfseXmlGZipB64: gzipSync(Buffer.from(xml)).toString("base64") }
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "autorizada");
  assert.equal(result.externalId, "987");
  assert.equal(result.protocol, accessKey);
});

test("monta e interpreta cancelamento de NFS-e Nacional", () => {
  const input = {
    accessKey: "31702062204252011000110000000000001234567890123456",
    companyDocument: "04.252.011/0001-10",
    reasonCode: "1" as const,
    reason: "Erro no valor informado & corrigido."
  };
  const cancellation = buildCancellationXml(input);

  assert.equal(cancellation.id, `PRE${input.accessKey}101101`);
  assert.match(cancellation.xml, /<infPedReg Id="PRE\d{56}">/);
  assert.match(cancellation.xml, /<e101101>[\s\S]*<cMotivo>1<\/cMotivo>/);
  assert.match(cancellation.xml, /Erro no valor informado &amp; corrigido\./);
  assert.deepEqual(validateCancellationInput(input).errors, []);

  const result = interpretCancellationResponse({ eventoXmlGZipB64: "H4sIAAAA" });
  assert.equal(result.ok, true);
  assert.equal(result.status, "cancelada");

  const rejected = interpretCancellationResponse({
    erro: { codigo: "E1101", descricao: "Prazo de cancelamento expirado" }
  });
  assert.equal(rejected.ok, false);
  assert.match(rejected.message, /E1101/);
});

test("rejeita justificativa de cancelamento curta", () => {
  const result = validateCancellationInput({
    accessKey: "31702062204252011000110000000000001234567890123456",
    companyDocument: "04.252.011/0001-10",
    reasonCode: "9",
    reason: "Muito curta"
  });

  assert.match(result.errors.join(" "), /15 e 255/);
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

test("traduz retorno do Inter para o fluxo financeiro", () => {
  assert.equal(mapInterChargeStatus("RECEBIDO"), "paga");
  assert.equal(mapInterChargeStatus("A_RECEBER"), "aguardando_pagamento");
  assert.equal(mapInterChargeStatus("EXPIRADO"), "vencida");
  assert.equal(mapInterChargeStatus("CANCELADO"), "cancelada");
});

test("classifica falhas de conexao do Inter sem expor credenciais", () => {
  assert.equal(classifyInterConnectionError(new Error("mac verify failure")), "inter_pfx_password");
  assert.equal(classifyInterConnectionError(new Error("HTTP 401 invalid_client")), "inter_credentials_environment");
  assert.equal(classifyInterConnectionError(new Error("HTTP 403 insufficient_scope")), "inter_scope");
  assert.equal(classifyInterConnectionError(new Error("Tempo limite excedido")), "inter_unavailable");
});

test("aplica permissoes por grupo e bloqueia auto-elevacao", () => {
  assert.equal(can({ userId: "u1", role: "master", permissions: [] }, "fiscal:emitir"), true);
  assert.equal(can({ userId: "u1", role: "usuario", permissions: ["financeiro:conciliar"] }, "financeiro:conciliar"), true);
  assert.throws(() => assertCannotChangeOwnElevation("u1", "u1", ["usuarios:configurar"]), /propria permissao/);
});

test("exclui apenas servico parado e sem lancamento financeiro", () => {
  assert.equal(serviceDeletionBlock("rascunho", false), null);
  assert.equal(serviceDeletionBlock("cancelado", false), null);
  assert.equal(serviceDeletionBlock("em_andamento", false), "service_active");
  assert.equal(serviceDeletionBlock("cancelado", true), "financial_entry");
});
