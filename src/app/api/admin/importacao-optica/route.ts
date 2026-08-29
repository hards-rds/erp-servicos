import { NextRequest, NextResponse } from "next/server";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import {
  buildOpticalImportPlan,
  clientInsertPayload,
  legacyClientDocument,
  normalizePersonName,
  onlyDigits,
  prescriptionInsertPayload,
  prescriptionSourceKey,
} from "@/lib/import/optical-legacy";
import { canCreateTenantResource } from "@/server/services/saas-plan-service";

export const runtime = "nodejs";
export const maxDuration = 300;

type ExistingClient = { id: string; document: string; legal_name: string };
type ExistingOptical = { clinical_data: { import?: { sourceKey?: string } } | null };

function jsonError(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function requireImportActor(companyId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("id,role,active").eq("id", user.id).maybeSingle();
  if (!profile || profile.active === false) return null;
  if (profile.role === "system_admin") return profile;

  const access = await requireCompanyPermission({
    module: "cadastros.clientes",
    action: "criar",
    segment: "otica",
    roles: ["master"]
  });
  return access.ok && access.company.id === companyId ? profile : null;
}

async function allClients(companyId: string) {
  const service = createServiceClient();
  const rows: ExistingClient[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from("clients").select("id,document,legal_name").eq("company_id", companyId).range(from, from + 999);
    if (error) throw error;
    rows.push(...((data || []) as ExistingClient[]));
    if ((data || []).length < 1000) break;
  }
  return rows;
}

async function allOpticalRecords(companyId: string) {
  const service = createServiceClient();
  const rows: ExistingOptical[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from("client_optical_records").select("clinical_data").eq("company_id", companyId).range(from, from + 999);
    if (error) throw error;
    rows.push(...((data || []) as ExistingOptical[]));
    if ((data || []).length < 1000) break;
  }
  return rows;
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const action = String(formData.get("action") || "preview");
  const companyId = String(formData.get("companyId") || "").trim();
  const actor = await requireImportActor(companyId);
  if (!actor) return jsonError("Acesso restrito ao administrador da empresa.", 403);
  const clientsFile = formData.get("clientsFile");
  const prescriptionsFile = formData.get("prescriptionsFile");
  if (!companyId || !(clientsFile instanceof File) || !(prescriptionsFile instanceof File)) return jsonError("Selecione as duas planilhas XLSX.");
  if (!clientsFile.name.toLowerCase().endsWith(".xlsx") || !prescriptionsFile.name.toLowerCase().endsWith(".xlsx")) return jsonError("Os dois arquivos devem estar no formato XLSX.");
  if (clientsFile.size > 6_000_000 || prescriptionsFile.size > 6_000_000) return jsonError("Cada arquivo deve ter no maximo 6 MB.");

  const service = createServiceClient();
  const { data: company } = await service.from("companies").select("id,name,service_segment,tenant_id").eq("id", companyId).maybeSingle();
  if (!company || company.service_segment !== "otica") return jsonError("Selecione uma empresa valida do segmento Otica.");

  try {
    const plan = await buildOpticalImportPlan(
      Buffer.from(await clientsFile.arrayBuffer()),
      Buffer.from(await prescriptionsFile.arrayBuffer()),
    );
    const summary = {
      "Clientes encontrados": plan.summary.clientRows,
      "Clientes com CPF/CNPJ": plan.summary.clientsWithDocument,
      "Clientes sem CPF/CNPJ": plan.summary.clientsWithoutDocument,
      "Receitas encontradas": plan.summary.prescriptionRows,
      "Receitas ligadas por CPF/CNPJ": plan.summary.prescriptionsMatchedByDocument,
      "Receitas ligadas por nome unico": plan.summary.prescriptionsMatchedByUniqueName,
      "Receitas para revisao": plan.summary.prescriptionsForReview + plan.summary.invalidPrescriptionDates,
    };
    if (action === "preview") return NextResponse.json({ ok: true, summary });
    if (action !== "import") return jsonError("Acao de importacao invalida.");

    const existingClients = await allClients(companyId);
    const existingByDocument = new Map(existingClients.map((client) => [client.document, client]));
    const existingByName = new Map<string, ExistingClient[]>();
    for (const client of existingClients) {
      const name = normalizePersonName(client.legal_name);
      existingByName.set(name, [...(existingByName.get(name) || []), client]);
    }

    const sourceClientIds = new Map<number, string>();
    const newClientRows: Array<ReturnType<typeof clientInsertPayload>> = [];
    for (const sourceClient of plan.clients) {
      const document = legacyClientDocument(sourceClient);
      const byDocument = existingByDocument.get(document);
      const name = normalizePersonName(sourceClient.values["Nome / Razao Social"]);
      const byUniqueName = !onlyDigits(sourceClient.values.Documento) && (existingByName.get(name) || []).length === 1
        ? existingByName.get(name)?.[0]
        : null;
      const existing = byDocument || byUniqueName;
      if (existing) sourceClientIds.set(sourceClient.sourceRow, existing.id);
      else newClientRows.push(clientInsertPayload(sourceClient, companyId, actor.id));
    }

    const capacity = await canCreateTenantResource(company.tenant_id, "clients");
    const available = capacity.limit === null ? Number.POSITIVE_INFINITY : Math.max(0, capacity.limit - capacity.usage);
    if (newClientRows.length > available) {
      return jsonError(`O plano ${capacity.plan.name} permite mais ${Number.isFinite(available) ? available.toLocaleString("pt-BR") : "registros ilimitados"} clientes. Nenhum dado foi importado.`, 409);
    }

    let insertedClients = 0;
    for (const batch of chunks(newClientRows, 300)) {
      const { data, error } = await service.from("clients").insert(batch).select("id,document,legal_name");
      if (error) throw error;
      insertedClients += data?.length || 0;
      for (const client of (data || []) as ExistingClient[]) existingByDocument.set(client.document, client);
    }
    for (const sourceClient of plan.clients) {
      if (!sourceClientIds.has(sourceClient.sourceRow)) {
        const client = existingByDocument.get(legacyClientDocument(sourceClient));
        if (client) sourceClientIds.set(sourceClient.sourceRow, client.id);
      }
    }

    const existingOptical = await allOpticalRecords(companyId);
    const existingSourceKeys = new Set(existingOptical.map((row) => row.clinical_data?.import?.sourceKey).filter(Boolean));
    let skippedExistingPrescriptions = 0;
    const reviewRows = new Set<number>();
    const prescriptionRows: NonNullable<ReturnType<typeof prescriptionInsertPayload>>[] = [];

    for (const prescription of plan.prescriptions) {
      const document = onlyDigits(prescription.values["CPF / CNPJ"]);
      const name = normalizePersonName(prescription.values["Nome / Razao Social"]);
      const sourceClient = document ? plan.clientsByDocument.get(document) : (plan.clientsByName.get(name) || []).length === 1 ? plan.clientsByName.get(name)?.[0] : null;
      if (!sourceClient) { reviewRows.add(prescription.sourceRow); continue; }
      const clientId = sourceClientIds.get(sourceClient.sourceRow);
      if (!clientId) { reviewRows.add(prescription.sourceRow); continue; }
      const sourceKey = prescriptionSourceKey(prescription);
      if (existingSourceKeys.has(sourceKey)) { skippedExistingPrescriptions += 1; continue; }
      const payload = prescriptionInsertPayload(prescription, companyId, clientId, actor.id);
      if (!payload) { reviewRows.add(prescription.sourceRow); continue; }
      prescriptionRows.push(payload);
    }

    let insertedPrescriptions = 0;
    for (const batch of chunks(prescriptionRows, 300)) {
      const { data, error } = await service.from("client_optical_records").insert(batch).select("id");
      if (error) throw error;
      insertedPrescriptions += data?.length || 0;
    }

    const imported = {
      clients: insertedClients,
      prescriptions: insertedPrescriptions,
      skippedExistingClients: plan.clients.length - insertedClients,
      skippedExistingPrescriptions,
      reviewRows: reviewRows.size,
    };
    await writeCompanyAudit({
      companyId,
      actorId: actor.id,
      entity: "optical_import",
      action: "import",
      reason: "Importacao administrativa de clientes e receitas opticas legadas.",
      metadata: { ...imported, clientsFile: clientsFile.name, prescriptionsFile: prescriptionsFile.name }
    });
    return NextResponse.json({ ok: true, summary, imported });
  } catch (error) {
    console.error("optical_import_error", error);
    return jsonError("Nao foi possivel concluir a importacao. A operacao pode ser repetida com os mesmos arquivos sem duplicar os registros ja gravados.", 500);
  }
}
