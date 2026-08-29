import { NextRequest, NextResponse } from "next/server";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";
import { isValidCpfOrCnpj, onlyDigits } from "@/lib/validations/br-documents";
import { isPlanLimitError } from "@/domains/billing/saas-plans";
import { canCreateTenantResource } from "@/server/services/saas-plan-service";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/cadastros/clientes?status=${status}`, request.url), 303);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const action = readString(formData, "action") || "create";
  const clientId = readString(formData, "clientId");
  const permissionAction = action === "delete" ? "excluir" : action === "update" ? "editar" : "criar";
  const access = await requireCompanyPermission({ module: "cadastros.clientes", action: permissionAction });
  if (!access.ok) {
    if (access.reason === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
    return redirectWith(request, access.reason === "forbidden" ? "forbidden" : "profile_error");
  }
  const { supabase, profile } = access;

  if (action === "delete") {
    if (!clientId) return redirectWith(request, "invalid_delete");

    const { data: deletedClients, error } = await supabase
      .from("clients")
      .delete()
      .eq("id", clientId)
      .eq("company_id", profile.company_id)
      .select("id");

    if (error?.code === "23503") return redirectWith(request, "delete_linked");
    if (error) return redirectWith(request, "delete_error");
    if (!deletedClients?.length) return redirectWith(request, "delete_not_found");
    await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "client", entityId: clientId, action: "delete" });
    return redirectWith(request, "deleted");
  }

  const rawDocument = readString(formData, "document");
  let document = onlyDigits(rawDocument);
  const legalName = readString(formData, "legalName");

  if (action === "update" && clientId && !isValidCpfOrCnpj(document)) {
    const { data: existingClient } = await supabase
      .from("clients")
      .select("document")
      .eq("id", clientId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (existingClient?.document?.startsWith("LEGADO-") && rawDocument === existingClient.document) {
      document = existingClient.document;
    }
  }

  if (!legalName || (!isValidCpfOrCnpj(document) && !document.startsWith("LEGADO-"))) {
    return redirectWith(request, "invalid");
  }

  const address = {
    street: readString(formData, "street"),
    number: readString(formData, "number"),
    complement: readString(formData, "complement"),
    district: readString(formData, "district"),
    city: readString(formData, "city"),
    cityCode: onlyDigits(readString(formData, "cityCode")),
    state: readString(formData, "state").toUpperCase(),
    zipCode: onlyDigits(readString(formData, "zipCode"))
  };

  const payload = {
    legal_name: legalName,
    trade_name: readString(formData, "tradeName") || null,
    document,
    municipal_registration: readString(formData, "municipalRegistration") || null,
    state_registration: readString(formData, "stateRegistration") || null,
    fiscal_email: readString(formData, "fiscalEmail") || null,
    financial_email: readString(formData, "financialEmail") || null,
    phone: readString(formData, "phone") || null,
    address,
    internal_notes: readString(formData, "internalNotes") || null,
    updated_by: profile.id
  };

  if (action === "update") {
    if (!clientId) return redirectWith(request, "invalid");

    const { error } = await supabase
      .from("clients")
      .update({
        ...payload,
        status: readString(formData, "status") || "ativo",
        updated_at: new Date().toISOString()
      })
      .eq("id", clientId)
      .eq("company_id", profile.company_id);

    if (!error) await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "client", entityId: clientId, action: "update" });
    const nextStatus = error?.code === "23505" ? "duplicate" : error ? "update_error" : "updated";
    return redirectWith(request, nextStatus);
  }

  const capacity = await canCreateTenantResource(profile.tenant_id, "clients");
  if (!capacity.allowed) return redirectWith(request, "plan_limit");

  const { data: created, error } = await supabase.from("clients").insert({
    ...payload,
    company_id: profile.company_id,
    status: "ativo",
    created_by: profile.id
  }).select("id").single();

  if (!error && created) await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "client", entityId: created.id, action: "create" });

  const nextStatus = error?.code === "23505" ? "duplicate" : isPlanLimitError(error) ? "plan_limit" : error ? "error" : "created";
  return redirectWith(request, nextStatus);
}
