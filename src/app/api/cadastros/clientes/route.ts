import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidCpfOrCnpj, onlyDigits } from "@/lib/validations/br-documents";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/cadastros/clientes?status=${status}`, request.url), 303);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,company_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.company_id) {
    return redirectWith(request, "profile_error");
  }

  const formData = await request.formData();
  const action = readString(formData, "action") || "create";
  const clientId = readString(formData, "clientId");

  if (action === "delete") {
    if (!clientId) return redirectWith(request, "invalid_delete");

    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("id", clientId)
      .eq("company_id", profile.company_id);

    if (error?.code === "23503") return redirectWith(request, "delete_linked");
    return redirectWith(request, error ? "delete_error" : "deleted");
  }

  const document = onlyDigits(readString(formData, "document"));
  const legalName = readString(formData, "legalName");

  if (!legalName || !isValidCpfOrCnpj(document)) {
    return redirectWith(request, "invalid");
  }

  const address = {
    street: readString(formData, "street"),
    number: readString(formData, "number"),
    complement: readString(formData, "complement"),
    district: readString(formData, "district"),
    city: readString(formData, "city"),
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

    const nextStatus = error?.code === "23505" ? "duplicate" : error ? "update_error" : "updated";
    return redirectWith(request, nextStatus);
  }

  const { error } = await supabase.from("clients").insert({
    ...payload,
    company_id: profile.company_id,
    status: "ativo",
    created_by: profile.id
  });

  const nextStatus = error?.code === "23505" ? "duplicate" : error ? "error" : "created";
  return redirectWith(request, nextStatus);
}
