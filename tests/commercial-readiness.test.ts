import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("aplicacao publica cabecalhos basicos de seguranca", () => {
  const config = readFileSync("next.config.ts", "utf8");
  for (const header of [
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Strict-Transport-Security"
  ]) {
    assert.match(config, new RegExp(header));
  }
});

test("middleware propaga identificador seguro de requisicao", () => {
  const middleware = readFileSync("src/middleware.ts", "utf8");
  assert.match(middleware, /crypto\.randomUUID\(\)/);
  assert.match(middleware, /headers\.set\("x-request-id", requestId\)/);
  assert.match(middleware, /request\.cookies\.set\(name, value\)/);
  assert.match(middleware, /currentRequestHeaders\(\)/);
  assert.match(middleware, /next\.headers\.set\("x-request-id", requestId\)/);
  assert.match(middleware, /redirect\.headers\.set\("x-request-id", requestId\)/);
});

test("endpoint de saude nao devolve detalhes internos da falha", () => {
  const route = readFileSync("src/app/api/health/route.ts", "utf8");
  assert.match(route, /createServiceClient\(\)/);
  assert.match(route, /status: "degraded"/);
  assert.match(route, /status: 503/);
  assert.match(route, /"Cache-Control": "no-store"/);
  assert.doesNotMatch(route, /error\.message|SUPABASE_SERVICE_ROLE_KEY|encrypted_payload/);
});

test("painel de saude e restrito e nao consulta segredos", () => {
  const page = readFileSync("src/app/(dashboard)/admin/saude/page.tsx", "utf8");
  const navigation = readFileSync("src/components/layout/app-shell-client.tsx", "utf8");
  assert.match(page, /profile\?\.role !== "system_admin"/);
  assert.match(page, /createServiceClient\(\)/);
  assert.match(page, /\.from\("nfse_documents"\)/);
  assert.match(page, /\.from\("boleto_charges"\)/);
  assert.match(page, /\.from\("planetchat_sync_runs"\)/);
  assert.doesNotMatch(page, /encrypted_payload|request_payload|response_payload/);
  assert.match(navigation, /href: "\/admin\/saude"/);
});

test("release comercial possui comando e checklist bloqueante", () => {
  const packageJson = readFileSync("package.json", "utf8");
  const checklist = readFileSync("docs/versao-comercial-1.0.md", "utf8");
  assert.match(packageJson, /"release:check"/);
  assert.match(checklist, /## Bloqueadores de release/);
  assert.match(checklist, /Isolamento entre tenants/);
  assert.match(checklist, /Backup recente/);
  assert.match(checklist, /\/api\/health/);
});
