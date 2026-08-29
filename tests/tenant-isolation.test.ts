import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tenantPages = [
  "src/app/(dashboard)/cadastros/clientes/page.tsx",
  "src/app/(dashboard)/cadastros/contratos/page.tsx",
  "src/app/(dashboard)/cadastros/servicos/page.tsx",
  "src/app/(dashboard)/configuracoes/emails/page.tsx",
  "src/app/(dashboard)/configuracoes/apis/page.tsx",
  "src/app/(dashboard)/configuracoes/usuarios/page.tsx",
  "src/app/(dashboard)/dashboard/page.tsx",
  "src/app/(dashboard)/escola/atletas/page.tsx",
  "src/app/(dashboard)/escola/matriculas/page.tsx",
  "src/app/(dashboard)/escola/presencas/page.tsx",
  "src/app/(dashboard)/escola/turmas/page.tsx",
  "src/app/(dashboard)/financeiro/boletos-cobrancas/page.tsx",
  "src/app/(dashboard)/financeiro/comissoes/page.tsx",
  "src/app/(dashboard)/financeiro/comissoes/vendedores/page.tsx",
  "src/app/(dashboard)/financeiro/entradas/page.tsx",
  "src/app/(dashboard)/financeiro/fluxo-de-caixa/page.tsx",
  "src/app/(dashboard)/financeiro/saidas/page.tsx",
  "src/app/(dashboard)/fiscal/emissao-nfse/page.tsx",
  "src/app/(dashboard)/fiscal/notas-emitidas/page.tsx",
  "src/app/(dashboard)/operacao/estoque/page.tsx",
  "src/app/(dashboard)/operacao/chamados/page.tsx",
  "src/app/(dashboard)/operacao/vendas/page.tsx",
  "src/app/(dashboard)/configuracoes/automacoes/page.tsx",
  "src/app/(dashboard)/notificacoes/page.tsx"
];

test("paginas operacionais filtram explicitamente a empresa ativa", () => {
  for (const file of tenantPages) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /\.eq\("company_id",/, `${file} precisa filtrar company_id`);
  }
});

test("integracao PlanetChat preserva tenant, historico e credenciais protegidas", () => {
  const migration = readFileSync("supabase/migrations/20260828120000_planetchat_integration.sql", "utf8");
  const sync = readFileSync("src/server/services/planetchat-sync-service.ts", "utf8");
  const credentials = readFileSync("src/lib/integrations/planetchat-credentials.ts", "utf8");
  const page = readFileSync("src/app/(dashboard)/operacao/chamados/page.tsx", "utf8");

  for (const table of [
    "support_orders",
    "support_order_events",
    "support_order_messages",
    "planetchat_attendant_metrics",
    "planetchat_sync_runs"
  ]) {
    assert.match(migration, new RegExp(`create policy ${table}_[\\s\\S]*?public\\.company_match\\(company_id\\)`));
  }
  assert.match(sync, /\.eq\("company_id", input\.companyId\)/);
  assert.match(sync, /onConflict: "company_id,provider,external_id"/);
  assert.match(sync, /previous\?\.match_status === "manual"/);
  assert.match(migration, /c\.company_id = support_orders\.company_id/);
  assert.match(migration, /s\.company_id = support_order_events\.company_id/);
  assert.match(credentials, /encryptCertificateSecret/);
  assert.doesNotMatch(page, /encrypted_payload|Authorization:\s*Bearer|intg_[A-Za-z0-9]/);
});

test("segmento escolar isola dados, preserva avaliacoes e gera mensalidade idempotente", () => {
  const migration = readFileSync("supabase/migrations/20260824170000_football_school_segment.sql", "utf8");
  const enrollmentRoute = readFileSync("src/app/api/escola/matriculas/route.ts", "utf8");
  const athleteRoute = readFileSync("src/app/api/escola/atletas/route.ts", "utf8");
  const navigation = readFileSync("src/components/layout/app-shell-client.tsx", "utf8");

  for (const table of [
    "school_guardians",
    "school_athletes",
    "school_classes",
    "school_enrollments",
    "school_attendance"
  ]) {
    assert.match(migration, new RegExp(`create policy ${table}_[\\s\\S]*?public\\.company_match\\(company_id\\)`));
  }
  assert.match(migration, /create policy school_evaluations_select/);
  assert.match(migration, /create policy school_evaluations_insert/);
  assert.doesNotMatch(migration, /create policy school_evaluations_update/);
  assert.match(enrollmentRoute, /school-enrollment:\$\{enrollment\.id\}:competence:\$\{competence\}/);
  assert.match(enrollmentRoute, /school_enrollment_id: enrollment\.id/);
  assert.match(enrollmentRoute, /onConflict: "company_id,idempotency_key"/);
  assert.match(athleteRoute, /school_athlete_evaluations/);
  assert.match(navigation, /onlyForSegments: \["escola_futebol"\]/);
});

test("RLS operacional nao concede acesso global ao system_admin", () => {
  const migration = readFileSync(
    "supabase/migrations/20260818184000_harden_tenant_isolation.sql",
    "utf8"
  );

  assert.doesNotMatch(migration, /app_is_system_admin\(\)\s+or\s+public\.company_match/);
  assert.match(migration, /select target_company_id = public\.app_current_company_id\(\)/);

  for (const table of [
    "clients",
    "financial_entries",
    "payables",
    "nfse_documents",
    "products",
    "sales",
    "commissions",
    "service_records"
  ]) {
    assert.match(migration, new RegExp(`on public\\.${table}\\nfor all to authenticated\\nusing \\(public\\.company_match\\(company_id\\)\\)`));
  }
});

test("administracao de usuarios valida empresa do usuario e dos grupos", () => {
  const route = readFileSync("src/app/api/users/route.ts", "utf8");
  assert.match(route, /\.eq\("company_id", companyId\)/);
  assert.match(route, /\.eq\("company_id", actor\.company_id\)/);
});

test("operacoes do Inter derivam cobranca e entrada da empresa ativa", () => {
  const route = readFileSync("src/app/api/billing/inter/charges/route.ts", "utf8");
  const webhook = readFileSync("src/app/api/webhooks/inter/cobrancas/route.ts", "utf8");
  assert.match(route, /\.eq\("company_id", profile\.company_id\)/);
  assert.match(webhook, /getInterCharge\(externalId, credentials\)/);
  assert.match(webhook, /loadActiveInterCredentials\(charge\.company_id\)/);
});

test("contratos geram financeiro antes da fila fiscal e mantem cobranca separada", () => {
  const route = readFileSync("src/app/api/cadastros/contratos/route.ts", "utf8");
  const flow = readFileSync("src/server/services/contract-recurring-flow.ts", "utf8");
  const page = readFileSync("src/app/(dashboard)/cadastros/contratos/page.tsx", "utf8");
  const emission = readFileSync("src/app/api/fiscal/nfse/emitir/route.ts", "utf8");

  assert.match(route, /action === "issue_nfse"/);
  assert.match(route, /action === "issue_charge"/);
  assert.match(route, /action === "generate_financial"/);
  assert.match(route, /hasValidNfseCodes\(fiscalServiceData, false\)/);
  assert.match(page, /Gerar financeiro/);
  assert.match(page, /Emitir NFS-e/);
  assert.match(page, /Emitir boleto/);
  assert.match(route, /const entry = await ensureContractEntry\(input, competence\)/);
  assert.match(route, /const documentId = await ensureContractNfse\(input, entry, fiscalData\)/);
  assert.match(emission, /ensureAuthorizedFinancialEntry/);
  assert.match(emission, /result\.status === "autorizada"/);
  assert.match(emission, /nfse_document_id: document\.id/);
  assert.match(flow, /financial_entry_id: entry\.entryId/);
  assert.match(flow, /nfse_document_id: documentId/);
});

test("automacoes recorrentes sao idempotentes e isoladas por empresa", () => {
  const migration = readFileSync("supabase/migrations/20260829140000_recurring_automation.sql", "utf8");
  const automation = readFileSync("src/server/services/recurrence-automation-service.ts", "utf8");
  const cron = readFileSync("src/app/api/cron/recorrencias/route.ts", "utf8");
  const vercel = readFileSync("vercel.json", "utf8");

  assert.match(migration, /unique \(company_id, source_type, source_id, competence\)/);
  assert.match(migration, /using \(public\.company_match\(company_id\)\)/);
  assert.doesNotMatch(migration, /app_is_system_admin\(\) or public\.company_match/);
  assert.match(automation, /target_company_id: companyId/);
  assert.match(automation, /target_competence: competence/);
  assert.match(automation, /ensureContractEntry\(input, competence\)/);
  assert.match(automation, /loadDueRows\("financial_entries"/);
  assert.match(automation, /loadDueRows\("payables"/);
  assert.match(automation, /\.eq\("company_id", entry\.company_id\)/);
  assert.doesNotMatch(automation, /emitirNfse|sendNfse|processNfse/);
  assert.match(cron, /process\.env\.CRON_SECRET/);
  assert.match(vercel, /\/api\/cron\/recorrencias/);
});

test("fila fiscal exige conferencia e protege notas autorizadas na limpeza", () => {
  const page = readFileSync("src/app/(dashboard)/fiscal/emissao-nfse/page.tsx", "utf8");
  const deletion = readFileSync("src/app/api/fiscal/nfse/excluir-teste/route.ts", "utf8");
  const cancelledFinance = readFileSync("src/app/api/fiscal/nfse/ajustar-financeiro-cancelada/route.ts", "utf8");
  const xml = readFileSync("src/app/api/fiscal/nfse/xml/route.ts", "utf8");

  assert.match(page, /Conferencia da NFS-e/);
  assert.match(page, /Confirmar e emitir NFS-e|NfseProcessForm/);
  assert.match(page, /\/api\/fiscal\/nfse\/xml/);
  assert.match(page, /\/api\/fiscal\/nfse\/danfse/);
  assert.match(deletion, /findAuthorizedNfseXml/);
  assert.match(deletion, /\["previsto", "emitido"\]/);
  assert.match(cancelledFinance, /document\.status !== "cancelada"/);
  assert.match(cancelledFinance, /status: "cancelado"/);
  assert.match(xml, /application\/xml/);
});

test("status do certificado e validado no servidor para a empresa ativa", () => {
  const page = readFileSync("src/app/(dashboard)/configuracoes/certificado-digital/page.tsx", "utf8");
  const runtime = readFileSync("src/lib/certificates/runtime-certificate.ts", "utf8");

  assert.match(page, /inspectRuntimeCertificate\(profile\.company_id\)/);
  assert.match(page, /pronto para emissao/);
  assert.doesNotMatch(page, /encrypted_pfx|encrypted_password/);
  assert.match(runtime, /\.eq\("company_id", companyId\)/);
  assert.match(runtime, /extractPfxSigningMaterials/);
  assert.match(runtime, /usable: true/);
});
