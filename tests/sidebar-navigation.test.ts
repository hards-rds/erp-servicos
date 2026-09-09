import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync("src/components/layout/app-shell-client.tsx", "utf8");

test("menu lateral recarrega a empresa ativa ao navegar entre modulos", () => {
  assert.match(shell, /const navigateFromSidebar/);
  assert.match(shell, /window\.location\.assign\(href\)/);
  assert.match(shell, /prefetch=\{false\}/);
  assert.match(shell, /onClick=\{\(event\) => navigateFromSidebar\(event, item\.href\)\}/);
});
