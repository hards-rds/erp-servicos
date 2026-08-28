import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlanetChatPhone } from "../src/domains/support/planetchat.ts";
import {
  fetchPlanetChatAttendantMetrics,
  fetchPlanetChatCustomerServices
} from "../src/lib/integrations/planetchat-client.ts";

test("normaliza telefones PlanetChat e clientes brasileiros para a mesma chave", () => {
  assert.equal(normalizePlanetChatPhone("+55 (34) 98888-7777"), "34988887777");
  assert.equal(normalizePlanetChatPhone("34988887777"), "34988887777");
  assert.equal(normalizePlanetChatPhone("whatsapp:+5534988887777"), "34988887777");
  assert.equal(normalizePlanetChatPhone(null), "");
});

test("pagina atendimentos a partir de 1 e metricas de atendentes a partir de 0", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/reports/attendants")) {
      return new Response(JSON.stringify({ data: [{ userId: "u1", userName: "Ana" }], totalCount: 1 }), { status: 200 });
    }
    return new Response(JSON.stringify({ customerServiceList: [{ id: "c1" }], totalCount: 1 }), { status: 200 });
  }) as typeof fetch;

  try {
    const credentials = { companyId: "empresa", token: "intg_teste", defaultSyncDays: 30 };
    await fetchPlanetChatCustomerServices(credentials, "2026-08-01T00:00:00.000Z", "2026-08-31T23:59:59.999Z");
    await fetchPlanetChatAttendantMetrics(credentials, "2026-08-01T00:00:00.000Z", "2026-08-31T23:59:59.999Z");
    assert.equal(new URL(calls[0]).searchParams.get("page"), "1");
    assert.equal(new URL(calls[1]).searchParams.get("page"), "0");
    assert.equal(new URL(calls[0]).searchParams.get("mode"), "report");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
