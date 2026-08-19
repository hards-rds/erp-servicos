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
  "src/app/(dashboard)/financeiro/boletos-cobrancas/page.tsx",
  "src/app/(dashboard)/financeiro/comissoes/page.tsx",
  "src/app/(dashboard)/financeiro/comissoes/vendedores/page.tsx",
  "src/app/(dashboard)/financeiro/entradas/page.tsx",
  "src/app/(dashboard)/financeiro/fluxo-de-caixa/page.tsx",
  "src/app/(dashboard)/financeiro/saidas/page.tsx",
  "src/app/(dashboard)/fiscal/emissao-nfse/page.tsx",
  "src/app/(dashboard)/fiscal/notas-emitidas/page.tsx",
  "src/app/(dashboard)/operacao/estoque/page.tsx",
  "src/app/(dashboard)/operacao/vendas/page.tsx"
];

test("paginas operacionais filtram explicitamente a empresa ativa", () => {
  for (const file of tenantPages) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /\.eq\("company_id",/, `${file} precisa filtrar company_id`);
  }
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

test("contratos separam emissao fiscal e cobranca sem gerar fluxo no cadastro", () => {
  const route = readFileSync("src/app/api/cadastros/contratos/route.ts", "utf8");
  const page = readFileSync("src/app/(dashboard)/cadastros/contratos/page.tsx", "utf8");
  const emission = readFileSync("src/app/api/fiscal/nfse/emitir/route.ts", "utf8");

  assert.match(route, /action === "issue_nfse"/);
  assert.match(route, /action === "issue_charge"/);
  assert.doesNotMatch(route, /action === "generate"/);
  assert.match(page, /Emitir NFS-e/);
  assert.match(page, /Emitir boleto/);
  assert.match(route, /const documentId = await ensureContractNfse\(input, fiscalData\)/);
  assert.doesNotMatch(route, /ensureContractNfse\(input, entry\)/);
  assert.match(emission, /ensureAuthorizedFinancialEntry/);
  assert.match(emission, /result\.status === "autorizada"/);
  assert.match(emission, /nfse_document_id: document\.id/);
});

test("fila fiscal exige conferencia e protege notas autorizadas na limpeza", () => {
  const page = readFileSync("src/app/(dashboard)/fiscal/emissao-nfse/page.tsx", "utf8");
  const deletion = readFileSync("src/app/api/fiscal/nfse/excluir-teste/route.ts", "utf8");
  const xml = readFileSync("src/app/api/fiscal/nfse/xml/route.ts", "utf8");

  assert.match(page, /Conferencia da NFS-e/);
  assert.match(page, /Confirmar e emitir NFS-e|NfseProcessForm/);
  assert.match(page, /\/api\/fiscal\/nfse\/xml/);
  assert.match(page, /\/api\/fiscal\/nfse\/danfse/);
  assert.match(deletion, /findAuthorizedNfseXml/);
  assert.match(deletion, /\["previsto", "emitido"\]/);
  assert.match(xml, /application\/xml/);
});
