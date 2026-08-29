import { NextRequest, NextResponse } from "next/server";
import type { ServiceSegment } from "@/domains/services/catalog";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";
import {
  buildStandardImportPlan,
  isStandardImportKind,
  readStandardImportRows,
  standardImportDefinitions,
  standardImportKey,
  standardImportTemplate,
  type StandardImportItem,
  type StandardImportKind
} from "@/lib/import/standard-import";
import { fetchAllReportRows } from "@/lib/reports/fetch-all";
import { canCreateTenantResource } from "@/server/services/saas-plan-service";

export const runtime = "nodejs";
export const maxDuration = 300;

const importTargets: Record<StandardImportKind, {
  table: string;
  module: string;
  conflict: string;
}> = {
  clients: { table: "clients", module: "cadastros.clientes", conflict: "company_id,document" },
  services: { table: "service_catalog", module: "cadastros.servicos", conflict: "company_id,code" },
  products: { table: "products", module: "operacao.estoque", conflict: "company_id,sku" },
  school_classes: { table: "school_classes", module: "escola", conflict: "company_id,name" }
};

function jsonError(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function importAccess(kind: StandardImportKind) {
  return requireCompanyPermission({
    module: importTargets[kind].module,
    action: "criar",
    segment: kind === "school_classes" ? "escola_futebol" : undefined
  });
}

type ImportSupabase = Extract<Awaited<ReturnType<typeof importAccess>>, { ok: true }>["supabase"];

function accessError(reason: string) {
  return jsonError(reason === "unauthorized" ? "Sessao expirada." : "Voce nao possui permissao para esta importacao.", reason === "unauthorized" ? 401 : 403);
}

function batches<T>(values: T[], size = 300) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function existingKeys(kind: StandardImportKind, companyId: string, supabase: ImportSupabase) {
  if (kind === "clients") {
    const rows = await fetchAllReportRows<{ document: string }>((from, to) => supabase.from("clients").select("document").eq("company_id", companyId).range(from, to));
    return new Set(rows.map((row) => row.document));
  }
  if (kind === "services") {
    const rows = await fetchAllReportRows<{ code: string | null }>((from, to) => supabase.from("service_catalog").select("code").eq("company_id", companyId).range(from, to));
    return new Set(rows.map((row) => String(row.code || "").toLowerCase()).filter(Boolean));
  }
  if (kind === "products") {
    const rows = await fetchAllReportRows<{ sku: string | null }>((from, to) => supabase.from("products").select("sku").eq("company_id", companyId).range(from, to));
    return new Set(rows.map((row) => String(row.sku || "").toLowerCase()).filter(Boolean));
  }
  const rows = await fetchAllReportRows<{ name: string }>((from, to) => supabase.from("school_classes").select("name").eq("company_id", companyId).range(from, to));
  return new Set(rows.map((row) => standardImportKey(row.name)));
}

function withOwnership(items: StandardImportItem[], companyId: string, actorId: string) {
  return items.map((item) => ({
    ...item.payload,
    company_id: companyId,
    created_by: actorId,
    updated_by: actorId
  }));
}

export async function GET(request: NextRequest) {
  const kindValue = request.nextUrl.searchParams.get("kind") || "";
  if (!isStandardImportKind(kindValue)) return jsonError("Tipo de importacao invalido.");
  const access = await importAccess(kindValue);
  if (!access.ok) return accessError(access.reason);
  const segment = access.company.service_segment as ServiceSegment;
  if (!standardImportDefinitions[kindValue].segments.includes(segment)) return jsonError("Importacao indisponivel para este segmento.", 403);

  const file = await standardImportTemplate(kindValue);
  return new NextResponse(file, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=modelo-${kindValue}.xlsx`,
      "Cache-Control": "no-store"
    }
  });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const kindValue = String(formData.get("kind") || "");
  const action = String(formData.get("action") || "preview");
  const file = formData.get("file");
  if (!isStandardImportKind(kindValue)) return jsonError("Tipo de importacao invalido.");
  if (!(file instanceof File)) return jsonError("Selecione uma planilha XLSX.");
  if (!file.name.toLowerCase().endsWith(".xlsx")) return jsonError("O arquivo deve estar no formato XLSX.");
  if (file.size > 6_000_000) return jsonError("A planilha deve ter no maximo 6 MB.");
  if (!["preview", "import"].includes(action)) return jsonError("Acao de importacao invalida.");

  const access = await importAccess(kindValue);
  if (!access.ok) return accessError(access.reason);
  const segment = access.company.service_segment as ServiceSegment;
  if (!standardImportDefinitions[kindValue].segments.includes(segment)) return jsonError("Importacao indisponivel para este segmento.", 403);

  try {
    const rows = await readStandardImportRows(Buffer.from(await file.arrayBuffer()));
    if (!rows.length) return jsonError("A planilha nao possui registros para importar.");
    if (rows.length > 20_000) return jsonError("A planilha excede o limite de 20.000 registros.");
    const plan = buildStandardImportPlan(kindValue, rows, segment);
    const currentKeys = await existingKeys(kindValue, access.company.id, access.supabase);
    const newItems = plan.items.filter((item) => !currentKeys.has(item.key));
    const duplicates = plan.items.length - newItems.length;
    const summary = {
      rows: plan.totalRows,
      ready: newItems.length,
      duplicates,
      errors: plan.errors.length
    };

    if (action === "preview") {
      return NextResponse.json({ ok: true, summary, errors: plan.errors.slice(0, 500) });
    }

    const limitedResource = kindValue === "clients" ? "clients" : ["services", "products"].includes(kindValue) ? "catalog_items" : null;
    if (limitedResource) {
      const capacity = await canCreateTenantResource(access.profile.tenant_id, limitedResource);
      const available = capacity.limit === null ? Number.POSITIVE_INFINITY : Math.max(0, capacity.limit - capacity.usage);
      if (newItems.length > available) {
        return jsonError(`O plano ${capacity.plan.name} permite mais ${Number.isFinite(available) ? available.toLocaleString("pt-BR") : "registros ilimitados"} neste cadastro. Revise a planilha ou o plano antes de importar.`, 409);
      }
    }

    let imported = 0;
    for (const batch of batches(withOwnership(newItems, access.company.id, access.profile.id))) {
      const result = kindValue === "products"
        ? await access.supabase.rpc("import_products_with_initial_stock", {
            target_company_id: access.company.id,
            product_rows: batch
          })
        : await access.supabase
            .from(importTargets[kindValue].table)
            .upsert(batch, { onConflict: importTargets[kindValue].conflict, ignoreDuplicates: true })
            .select("id");
      if (result.error) throw result.error;
      imported += result.data?.length || 0;
    }

    await writeCompanyAudit({
      companyId: access.company.id,
      actorId: access.profile.id,
      entity: "standard_import",
      action: "import",
      metadata: { kind: kindValue, imported, duplicates, invalidRows: plan.errors.length, sourceFile: file.name }
    });
    return NextResponse.json({ ok: true, summary, errors: plan.errors.slice(0, 500), imported });
  } catch (error) {
    console.error("standard_import_failed", { kind: kindValue, error: error instanceof Error ? error.message : "unknown" });
    return jsonError("Nao foi possivel processar a planilha. Revise o modelo e tente novamente.", 500);
  }
}
