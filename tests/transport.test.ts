import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  cteValidationErrors,
  isValidAccessKey,
  isValidBrazilianPlate,
  isValidCityCode,
  normalizePlate,
  parseTransportNumber
} from "../src/domains/transport/validation.ts";

test("normaliza e valida placas antigas e Mercosul", () => {
  assert.equal(normalizePlate("abc-1d23"), "ABC1D23");
  assert.equal(isValidBrazilianPlate("ABC-1234"), true);
  assert.equal(isValidBrazilianPlate("ABC1D23"), true);
  assert.equal(isValidBrazilianPlate("AB12D34"), false);
});

test("valida codigos e numeros usados pela viagem", () => {
  assert.equal(isValidCityCode("3170206"), true);
  assert.equal(isValidCityCode("317020"), false);
  assert.equal(isValidAccessKey("1".repeat(44)), true);
  assert.equal(isValidAccessKey("1".repeat(43)), false);
  assert.equal(parseTransportNumber("1.234,56"), 1234.56);
});

test("validacao fiscal aponta todos os campos estruturais ausentes", () => {
  const errors = cteValidationErrors({
    cfop: "53", operationNature: "", issueState: "M", originCityCode: "1",
    destinationCityCode: "2", vehiclePlate: "x", driverDocument: "1", clientDocument: "2", freightValue: 0
  });
  assert.ok(errors.length >= 8);
  assert.deepEqual(cteValidationErrors({
    cfop: "5353", operationNature: "Prestacao de servico de transporte", issueState: "MG",
    originCityCode: "3170206", destinationCityCode: "3106200", vehiclePlate: "ABC1D23",
    driverDocument: "12345678901", clientDocument: "12345678000199", freightValue: 1500
  }), []);
});

test("modulo exige segmento, empresa ativa e chaves compostas", () => {
  const access = readFileSync("src/lib/transport/server.ts", "utf8");
  const migration = readFileSync("supabase/migrations/20260902103000_transport_carrier_segment.sql", "utf8");
  const tripsApi = readFileSync("src/app/api/transporte/viagens/route.ts", "utf8");
  assert.match(access, /segment: "transportadora"/);
  assert.match(migration, /company_match\(company_id\)/);
  assert.match(migration, /transport_trips_vehicle_fk foreign key \(company_id, vehicle_id\)/);
  assert.match(tripsApi, /transport-trip:\$\{trip\.id\}:freight/);
  assert.match(tripsApi, /onConflict: "company_id,idempotency_key"/);
});
