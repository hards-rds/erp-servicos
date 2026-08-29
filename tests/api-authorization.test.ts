import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [relative(process.cwd(), path)] : [];
  });
}

test("helper central valida sessao, tenant, empresa ativa e permissao", () => {
  const source = read("src/lib/auth/api-access.ts");
  assert.match(source, /auth\.getUser\(\)/);
  assert.match(source, /\.eq\("tenant_id", profile\.tenant_id\)/);
  assert.match(source, /company\.active === false/);
  assert.match(source, /rpc\("app_has_permission"/);
});

test("consulta de documento e exportacao exigem permissao", () => {
  const documentRoute = read("src/app/api/cadastros/documento/route.ts");
  const reportRoute = read("src/app/api/relatorios/exportar/route.ts");
  assert.match(documentRoute, /requireCompanyPermission/);
  assert.match(documentRoute, /module: "cadastros\.clientes"/);
  assert.match(reportRoute, /module: "relatorios"/);
});

test("permissoes operacionais sao provisionadas para tenants existentes", () => {
  const migration = read("supabase/migrations/20260829120000_commercial_authorization.sql");
  for (const permissionModule of ["operacao.vendas", "operacao.estoque", "operacao.chamados"]) {
    assert.match(migration, new RegExp(permissionModule.replace(".", "\\.")));
  }
  assert.match(migration, /insert into public\.group_permissions/);
  assert.match(migration, /on conflict do nothing/);
});

test("toda API de negocio declara sua barreira de acesso", () => {
  const publicRoutes = new Set([
    "src/app/api/auth/login/route.ts",
    "src/app/api/auth/logout/route.ts",
    "src/app/api/auth/change-password/route.ts",
    "src/app/api/health/route.ts",
    "src/app/api/webhooks/inter/cobrancas/route.ts"
  ]);
  const customProtectedRoutes = new Set(["src/app/api/admin/switch-company/route.ts"]);
  const cronRoutes = new Set(["src/app/api/cron/recorrencias/route.ts"]);
  const protectedMarkers = /requireCompanyPermission|app_has_permission|getSchoolContext|requireSystemAdmin/;

  for (const file of routeFiles(join(process.cwd(), "src/app/api"))) {
    if (publicRoutes.has(file) || customProtectedRoutes.has(file)) continue;
    if (cronRoutes.has(file)) {
      const source = readFileSync(file, "utf8");
      assert.match(source, /process\.env\.CRON_SECRET/, `${file} precisa exigir CRON_SECRET`);
      assert.match(source, /authorization/, `${file} precisa validar Authorization`);
      continue;
    }
    assert.match(readFileSync(file, "utf8"), protectedMarkers, `${file} precisa declarar autorizacao`);
  }
});

test("troca de empresa exige administrador do sistema ou vinculo ativo", () => {
  const source = read("src/app/api/admin/switch-company/route.ts");
  assert.match(source, /supabase\.auth\.getUser\(\)/);
  assert.match(source, /profile\.active === false/);
  assert.match(source, /company\.active === false/);
  assert.match(source, /profile\.role === "system_admin"/);
  assert.match(source, /\.from\("company_members"\)/);
  assert.match(source, /\.eq\("user_id", user\.id\)/);
  assert.match(source, /\.eq\("active", true\)/);
});

test("operacoes financeiras, fiscais e administrativas sensiveis geram auditoria", () => {
  for (const file of [
    "src/app/api/financeiro/entradas/route.ts",
    "src/app/api/financeiro/saidas/route.ts",
    "src/app/api/operacao/vendas/route.ts",
    "src/app/api/cadastros/contratos/route.ts",
    "src/app/api/fiscal/nfse/emitir/route.ts",
    "src/app/api/users/route.ts",
    "src/app/api/admin/tenants/route.ts"
  ]) {
    assert.match(read(file), /writeCompanyAudit/, `${file} precisa registrar auditoria`);
  }
});
