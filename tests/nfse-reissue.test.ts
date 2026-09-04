import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canReopenContractEntryAfterNfseCancellation,
  contractNfseIdempotencyKey
} from "../src/domains/contracts/nfse-reissue.ts";

test("reabre somente entrada nao recebida cuja fila fiscal foi integralmente cancelada", () => {
  assert.equal(canReopenContractEntryAfterNfseCancellation({
    status: "cancelado",
    receivedAt: null,
    documentStatuses: ["cancelada"]
  }), true);
  assert.equal(canReopenContractEntryAfterNfseCancellation({
    status: "cancelado",
    receivedAt: "2026-09-03",
    documentStatuses: ["cancelada"]
  }), false);
  assert.equal(canReopenContractEntryAfterNfseCancellation({
    status: "cancelado",
    receivedAt: null,
    documentStatuses: ["cancelada", "autorizada"]
  }), false);
  assert.equal(canReopenContractEntryAfterNfseCancellation({
    status: "cancelado",
    receivedAt: null,
    documentStatuses: []
  }), false);
});

test("gera uma chave estavel para cada reemissao sem colidir com a nota cancelada", () => {
  assert.equal(
    contractNfseIdempotencyKey("contract-1", "2026-09"),
    "nfse:contract:contract-1:competence:2026-09"
  );
  assert.equal(
    contractNfseIdempotencyKey("contract-1", "2026-09", "cancelled-document-1"),
    "nfse:contract:contract-1:competence:2026-09:reemissao:cancelled-document-1"
  );
});

test("reemissao preserva historico fiscal e permite repetir competencia concluida cancelada", () => {
  const migration = readFileSync("supabase/migrations/20260904080000_reissue_cancelled_nfse.sql", "utf8");
  const flow = readFileSync("src/server/services/contract-recurring-flow.ts", "utf8");
  const route = readFileSync("src/app/api/configuracoes/automacoes/route.ts", "utf8");
  const page = readFileSync("src/app/(dashboard)/configuracoes/automacoes/page.tsx", "utf8");

  assert.match(migration, /replaces_document_id uuid references public\.nfse_documents/);
  assert.match(migration, /existing\.status = 'concluido'[\s\S]*document\.status = 'cancelada'/);
  assert.match(flow, /canReopenContractEntryAfterNfseCancellation/);
  assert.match(flow, /replaces_document_id: replacedDocument\?\.id \|\| null/);
  assert.match(flow, /replacementOfDocumentId: replacedDocument\?\.id \|\| null/);
  assert.match(route, /runRecurringAutomation\(\{ companyId: access\.profile\.company_id, competence \}\)/);
  assert.match(page, /name="competence" value=\{competence\}/);
  assert.match(page, /processedFailed > 0 \? "error" : processedPartial > 0 \? "warning"/);
  assert.match(page, /message\.kind === "warning" \? "form-warning"/);
});
