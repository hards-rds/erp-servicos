import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { parseCommissionClients } from "../src/domains/people/commission-clients.ts";

const company = "10000000-0000-0000-0000-000000000001";
const otherCompany = "10000000-0000-0000-0000-000000000002";
const client = "20000000-0000-0000-0000-000000000001";
const secondClient = "20000000-0000-0000-0000-000000000002";
const foreignClient = "20000000-0000-0000-0000-000000000003";
const contractor = "30000000-0000-0000-0000-000000000001";

test("valida a selecao e distingue todos os clientes de uma selecao vazia", () => {
  assert.deepEqual(parseCommissionClients("all", [client]), { valid: true, clientIds: null });
  assert.deepEqual(parseCommissionClients("selected", [client, client, secondClient]), { valid: true, clientIds: [client, secondClient] });
  assert.equal(parseCommissionClients("selected", []).valid, false);
  assert.equal(parseCommissionClients("selected", ["invalido"]).valid, false);
  assert.equal(parseCommissionClients("", []).valid, false);
});

test("SQL calcula comissoes apenas dos clientes selecionados e preserva fechamentos aprovados", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create function public.app_current_company_id() returns uuid language sql as $$ select '${company}'::uuid $$;
      create function public.app_has_permission(text, text) returns boolean language sql as $$ select current_setting('app.allow', true) = 'yes' $$;
      set app.allow = 'yes';
      create table companies (id uuid primary key);
      create table profiles (id uuid primary key);
      create table payables (id uuid primary key);
      create table clients (id uuid primary key, company_id uuid, legal_name text, trade_name text);
      create table contracts (id uuid primary key, company_id uuid, client_id uuid, service_description text,
        recurring_amount numeric, status text, starts_at date, ends_at date, periodicity text);
      create table financial_entries (id uuid primary key, company_id uuid, client_id uuid, contract_id uuid,
        description text, received_amount numeric, net_amount numeric, status text, received_at date);
      insert into companies values ('${company}'), ('${otherCompany}');
      insert into clients values ('${client}', '${company}', 'Cliente A', null),
        ('${secondClient}', '${company}', 'Cliente A - filial', null),
        ('${foreignClient}', '${otherCompany}', 'Outro tenant', null);
    `);
    const original = readFileSync("supabase/migrations/20260831173000_contractor_compensations.sql", "utf8");
    await db.exec(original.slice(original.indexOf("create table"), original.indexOf("create index")));
    // Existing records must retain the all-clients calculation after migration.
    await db.query(`insert into contractors (id, company_id, legal_name, tax_id, role_title, starts_at,
      fixed_monthly_amount, cost_allowance_amount, commission_rate)
      values ($1, $2, 'Prestador', '12345678901234', 'Suporte', '2026-01-01', 100, 20, 10)`, [contractor, company]);
    await db.exec(readFileSync("supabase/migrations/20260906100000_contractor_commission_clients.sql", "utf8"));
    await db.exec(`
      insert into contracts values
        ('40000000-0000-0000-0000-000000000001', '${company}', '${client}', 'Contrato 1', 1000, 'ativo', '2026-01-01', null, 'mensal'),
        ('40000000-0000-0000-0000-000000000002', '${company}', '${client}', 'Contrato 2', 500, 'ativo', '2026-01-01', null, 'mensal'),
        ('40000000-0000-0000-0000-000000000003', '${company}', '${secondClient}', 'Contrato filial', 2000, 'ativo', '2026-01-01', null, 'mensal'),
        ('40000000-0000-0000-0000-000000000004', '${otherCompany}', '${foreignClient}', 'Outro tenant', 9000, 'ativo', '2026-01-01', null, 'mensal');
      insert into financial_entries values
        ('50000000-0000-0000-0000-000000000001', '${company}', '${client}', '40000000-0000-0000-0000-000000000001', 'Recebido A', 400, 1000, 'recebido', '2026-09-05'),
        ('50000000-0000-0000-0000-000000000002', '${company}', '${secondClient}', '40000000-0000-0000-0000-000000000003', 'Recebido filial', 800, 2000, 'recebido', '2026-09-05'),
        ('50000000-0000-0000-0000-000000000003', '${company}', '${client}', '40000000-0000-0000-0000-000000000001', 'Outro mes', 600, 1000, 'recebido', '2026-08-05');
    `);
    const generate = () => db.query("select app_generate_contractor_compensation($1, '2026-09')", [contractor]);
    const totals = async () => (await db.query<{ commission_base: string; commission_amount: string; total_amount: string }>(
      "select commission_base, commission_amount, total_amount from contractor_compensations"
    )).rows[0];
    await generate();
    assert.deepEqual(await totals(), { commission_base: "3500.00", commission_amount: "350.00", total_amount: "470.00" });
    await db.query("update contractors set commission_client_ids = $1::uuid[] where id = $2", [[client, client], contractor]);
    await generate();
    assert.deepEqual(await totals(), { commission_base: "1500.00", commission_amount: "150.00", total_amount: "270.00" });
    assert.equal((await db.query("select * from contractor_compensation_items")).rows.length, 2);
    assert.equal((await db.query("select * from contractor_compensations")).rows.length, 1);
    await db.exec("update contractors set commission_basis = 'received'");
    await generate();
    assert.deepEqual(await totals(), { commission_base: "400.00", commission_amount: "40.00", total_amount: "160.00" });
    assert.equal((await db.query("select * from contractor_compensation_items")).rows.length, 1);
    for (const selection of [[foreignClient], ["20000000-0000-0000-0000-999999999999"], [], [null]]) {
      await assert.rejects(db.query("update contractors set commission_client_ids = $1::uuid[] where id = $2", [selection, contractor]));
    }
    await db.exec("update contractor_compensations set status = 'aprovado'; update contractors set commission_client_ids = null");
    await assert.rejects(generate(), /contractor_compensation_locked/);
    assert.deepEqual(await totals(), { commission_base: "400.00", commission_amount: "40.00", total_amount: "160.00" });
    await db.exec("set app.allow = 'no'");
    await assert.rejects(generate(), /contractor_compensation_forbidden/);
  } finally {
    await db.close();
  }
});
