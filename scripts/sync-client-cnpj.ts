import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { lookupCnpjRegistration, mergeClientRegistration } from "../src/lib/integrations/brasil-api.ts";
import { isValidCnpj, onlyDigits } from "../src/lib/validations/br-documents.ts";

type ClientRow = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  document: string;
  fiscal_email: string | null;
  financial_email: string | null;
  phone: string | null;
  address: Record<string, unknown> | null;
};

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function loadEnv(path: string) {
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    const separator = line.indexOf("=");
    if (!line || line.startsWith("#") || separator < 1) continue;
    const key = line.slice(0, separator).replace(/^export\s+/, "").trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries: string[] = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

const envPath = argument("--env") || `${process.cwd()}/.env.local`;
const companyName = argument("--company");
const apply = process.argv.includes("--apply");

if (!companyName) throw new Error("Informe --company com o nome exato da empresa.");
loadEnv(envPath);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Supabase nao configurado no arquivo de ambiente.");

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const { data: companies, error: companyError } = await supabase
  .from("companies")
  .select("id,name")
  .ilike("name", companyName);

if (companyError) throw companyError;
if (companies?.length !== 1) throw new Error(`Empresa nao localizada de forma unica: ${companyName}.`);
const company = companies[0];

const clients: ClientRow[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase
    .from("clients")
    .select("id,legal_name,trade_name,document,fiscal_email,financial_email,phone,address")
    .eq("company_id", company.id)
    .order("legal_name")
    .range(from, from + 999);
  if (error) throw error;
  clients.push(...((data || []) as ClientRow[]));
  if (!data || data.length < 1000) break;
}

let changed = 0;
let unchanged = 0;
let skipped = 0;
let failed = 0;
const changedNames: Array<{ document: string; before: string; after: string }> = [];

for (const client of clients) {
  const document = onlyDigits(client.document);
  if (!isValidCnpj(document)) {
    skipped += 1;
    continue;
  }

  try {
    const registration = await lookupCnpjRegistration(document);
    const merged = mergeClientRegistration(client, registration);
    const currentComparable = {
      legal_name: client.legal_name,
      trade_name: client.trade_name,
      fiscal_email: client.fiscal_email,
      financial_email: client.financial_email,
      phone: client.phone,
      address: client.address || {}
    };

    if (stable(currentComparable) === stable(merged)) {
      unchanged += 1;
      continue;
    }

    changed += 1;
    changedNames.push({ document, before: client.legal_name, after: merged.legal_name });
    console.log(`${apply ? "ATUALIZANDO" : "ALTERARIA"} ${document}: ${client.legal_name} -> ${merged.legal_name}`);

    if (apply) {
      const { error } = await supabase
        .from("clients")
        .update({ ...merged, updated_at: new Date().toISOString() })
        .eq("id", client.id)
        .eq("company_id", company.id);
      if (error) throw error;
    }
  } catch (error) {
    failed += 1;
    console.error(`FALHA ${document}: ${error instanceof Error ? error.message : "erro desconhecido"}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 120));
}

if (apply && changed > 0) {
  await supabase.from("audit_logs").insert({
    company_id: company.id,
    actor_id: null,
    entity: "client",
    action: "bulk_cnpj_sync",
    reason: "Atualizacao cadastral autorizada dos clientes pela consulta publica de CNPJ.",
    metadata: { total: clients.length, changed, unchanged, skipped, failed, changedNames }
  });
}

console.log(JSON.stringify({ mode: apply ? "apply" : "preview", company: company.name, total: clients.length, changed, unchanged, skipped, failed }, null, 2));
if (failed > 0) process.exitCode = 2;
