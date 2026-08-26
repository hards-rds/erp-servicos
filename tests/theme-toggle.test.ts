import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("tema claro e escuro e carregado antes da interface e persiste no navegador", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const shell = readFileSync("src/components/layout/app-shell-client.tsx", "utf8");
  const css = readFileSync("src/app/globals.css", "utf8");

  assert.match(layout, /erp-servicos:theme/);
  assert.match(layout, /document\.documentElement\.dataset\.theme/);
  assert.match(shell, /const THEME_STORAGE_KEY = "erp-servicos:theme"/);
  assert.match(shell, /window\.localStorage\.setItem\(THEME_STORAGE_KEY, next\)/);
  assert.match(shell, /Usar tema claro/);
  assert.match(shell, /Usar tema escuro/);
  assert.match(shell, /<Sun aria-hidden="true" \/>/);
  assert.match(shell, /<Moon aria-hidden="true" \/>/);
  assert.match(css, /:root\[data-theme="light"\]/);
  assert.match(css, /color-scheme: light/);
  assert.match(css, /--topbar: rgba\(255, 255, 255, 0\.94\)/);
});
