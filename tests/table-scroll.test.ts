import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const enhancer = readFileSync("src/components/ui/global-table-scroll.tsx", "utf8");
const shell = readFileSync("src/components/layout/app-shell-client.tsx", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");

test("adiciona rolagem superior sincronizada a todas as tabelas do sistema", () => {
  assert.match(shell, /<GlobalTableScroll \/>/);
  assert.match(enhancer, /\.content \.table-wrap/);
  assert.match(enhancer, /wrapper\.scrollLeft = rail\.scrollLeft/);
  assert.match(enhancer, /rail\.scrollLeft = wrapper\.scrollLeft/);
  assert.match(enhancer, /new ResizeObserver\(update\)/);
  assert.match(enhancer, /new MutationObserver\(refresh\)/);
});

test("a barra superior permanece acessivel e some quando nao ha transbordamento", () => {
  assert.match(enhancer, /rail\.hidden = wrapper\.scrollWidth <= wrapper\.clientWidth \+ 1/);
  assert.match(css, /\.table-scroll-top \{[\s\S]*?position: sticky;[\s\S]*?top: 68px;/);
  assert.match(css, /\.table-scroll-top\[hidden\] \{[\s\S]*?display: none;/);
  assert.match(css, /@media \(max-width: 760px\) \{[\s\S]*?\.table-scroll-top \{[\s\S]*?display: none;/);
});

test("mantem a coluna de acoes visivel em monitores desktop", () => {
  assert.match(enhancer, /normalizeHeader\(lastHeader\?\.textContent \|\| ""\) === "acoes"/);
  assert.match(css, /@media \(min-width: 981px\) \{[\s\S]*?\.table-sticky-actions td:last-child \{[\s\S]*?position: sticky;[\s\S]*?right: 0;/);
});
