import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidCpfOrCnpj, onlyDigits } from "@/lib/validations/br-documents";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
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
    return NextResponse.redirect(new URL("/cadastros/clientes?status=profile_error", request.url), 303);
  }

  const formData = await request.formData();
  const document = onlyDigits(readString(formData, "document"));
  const legalName = readString(formData, "legalName");

  if (!legalName || !isValidCpfOrCnpj(document)) {
    return NextResponse.redirect(new URL("/cadastros/clientes?status=invalid", request.url), 303);
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

  const { error } = await supabase.from("clients").insert({
    company_id: profile.company_id,
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
    status: "ativo",
    created_by: profile.id,
    updated_by: profile.id
  });

  const nextStatus = error?.code === "23505" ? "duplicate" : error ? "error" : "created";
  return NextResponse.redirect(new URL(`/cadastros/clientes?status=${nextStatus}`, request.url), 303);
}
