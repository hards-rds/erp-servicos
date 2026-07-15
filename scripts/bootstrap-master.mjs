import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const MASTER_EMAIL = "lucas@mundolivre.com.br";
const MASTER_NAME = "Lucas Rocha";
const COMPANY_NAME = "Mundo Livre tecnologia";
const COMPANY_DOCUMENT = "";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index);
    const rawValue = trimmed.slice(index + 1);
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function randomPassword() {
  return `${randomBytes(18).toString("base64url")}A1!`;
}

async function deleteFrom(supabase, table, column = "created_at") {
  const { error } = await supabase.from(table).delete().not(column, "is", null);
  if (error && error.code !== "PGRST116") throw new Error(`Falha ao limpar ${table}: ${error.message}`);
}

async function main() {
  loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local.");
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const authUsers = [];
  for (let page = 1; page < 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    authUsers.push(...data.users);
    if (data.users.length < 100) break;
  }

  for (const user of authUsers) {
    if (user.email?.toLowerCase() !== MASTER_EMAIL) {
      const { error } = await supabase.auth.admin.deleteUser(user.id);
      if (error) throw error;
    }
  }

  const businessTables = [
    ["audit_logs"],
    ["email_logs"],
    ["email_settings"],
    ["files"],
    ["api_credentials"],
    ["digital_certificates"],
    ["boleto_charges"],
    ["nfse_events"],
    ["nfse_documents"],
    ["bank_reconciliations", "reconciled_at"],
    ["bank_transactions"],
    ["bank_accounts"],
    ["payables"],
    ["financial_entries"],
    ["contract_adjustments"],
    ["contracts"],
    ["client_contacts"],
    ["clients"],
    ["user_groups"],
    ["group_permissions"],
    ["groups"],
    ["profiles"],
    ["companies"]
  ];
  for (const [table, column] of businessTables) {
    await deleteFrom(supabase, table, column);
  }

  const password = process.env.MASTER_PASSWORD || randomPassword();
  const existingMaster = authUsers.find((user) => user.email?.toLowerCase() === MASTER_EMAIL);
  let masterUserId = existingMaster?.id;
  if (masterUserId) {
    const { error } = await supabase.auth.admin.updateUserById(masterUserId, {
      password,
      email_confirm: true,
      user_metadata: { nome: MASTER_NAME }
    });
    if (error) throw error;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: MASTER_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { nome: MASTER_NAME }
    });
    if (error) throw error;
    masterUserId = data.user.id;
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .insert({ name: COMPANY_NAME, document: COMPANY_DOCUMENT, active: true })
    .select("id")
    .single();
  if (companyError) throw companyError;

  const { error: seedError } = await supabase.rpc("seed_default_erp_groups", {
    target_company_id: company.id
  });
  if (seedError) throw seedError;

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: masterUserId,
    company_id: company.id,
    email: MASTER_EMAIL,
    name: MASTER_NAME,
    role: "master",
    active: true,
    updated_at: new Date().toISOString()
  });
  if (profileError) throw profileError;

  const { data: masterGroup, error: groupError } = await supabase
    .from("groups")
    .select("id")
    .eq("company_id", company.id)
    .eq("name", "Master Geral")
    .single();
  if (groupError) throw groupError;

  const { error: userGroupError } = await supabase
    .from("user_groups")
    .upsert({ user_id: masterUserId, group_id: masterGroup.id });
  if (userGroupError) throw userGroupError;

  writeFileSync(".master-password.local", `${password}\n`, "utf8");
  console.log(`Master criado: ${MASTER_EMAIL}`);
  console.log("Senha temporaria salva em .master-password.local");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
