import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("padroniza dimensoes e alinhamento dos botoes da plataforma", () => {
  assert.match(css, /\.primary-button,[\s\S]*?appearance: none;/);
  assert.match(css, /\.primary-button,[\s\S]*?display: inline-flex;/);
  assert.match(css, /\.primary-button,[\s\S]*?padding: 0 14px;/);
  assert.match(css, /\.primary-button,[\s\S]*?min-height: 40px;/);
  assert.match(css, /\.icon-button \{[\s\S]*?width: 40px;[\s\S]*?height: 40px;[\s\S]*?padding: 0;/);
});

test("separa as acoes dos campos e empilha o rodape dos modais no celular", () => {
  assert.match(css, /\.form-stack \{[\s\S]*?grid-auto-rows: max-content;/);
  assert.match(css, /\.dialog-actions \{[\s\S]*?padding-top: 16px;[\s\S]*?border-top: 1px solid var\(--line\);/);
  assert.match(css, /@media \(max-width: 620px\) \{[\s\S]*?\.dialog-actions \{[\s\S]*?grid-template-columns: 1fr;/);
  assert.match(css, /\.dialog-actions > button,[\s\S]*?width: 100%;/);
});
