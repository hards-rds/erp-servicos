import { NextRequest, NextResponse } from "next/server";
import { serviceTypeOptions, type ServiceSegment } from "@/domains/services/catalog";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function parseMoney(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/cadastros/servicos?view=catalogo&status=${status}`, request.url), 303);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,company_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.company_id) return redirectWith(request, "profile_error");

  const formData = await request.formData();
  const action = readString(formData, "action");

  if (action === "toggle") {
    const catalogServiceId = readString(formData, "catalogServiceId");
    const active = readString(formData, "active") === "true";
    if (!catalogServiceId) return redirectWith(request, "catalog_invalid");
    const { error } = await supabase
      .from("service_catalog")
      .update({ active, updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("id", catalogServiceId)
      .eq("company_id", profile.company_id);
    return redirectWith(request, error ? "catalog_error" : "catalog_updated");
  }

  if (!["create", "update"].includes(action)) return redirectWith(request, "catalog_invalid");

  const catalogServiceId = readString(formData, "catalogServiceId");
  const name = readString(formData, "name");
  const serviceType = readString(formData, "serviceType") || "avulso";
  const salePrice = parseMoney(readString(formData, "salePrice"));
  if ((action === "update" && !catalogServiceId) || !name || salePrice === null || salePrice < 0) {
    return redirectWith(request, "catalog_invalid");
  }

  const { data: company } = await supabase
    .from("companies")
    .select("service_segment")
    .eq("id", profile.company_id)
    .maybeSingle();
  const segment = (company?.service_segment || "tecnologia") as ServiceSegment;
  const allowedTypes = new Set((serviceTypeOptions[segment] || serviceTypeOptions.tecnologia).map((item) => item.value));
  if (!allowedTypes.has(serviceType)) return redirectWith(request, "catalog_invalid");

  const payload = {
    code: readString(formData, "code") || null,
    name,
    description: readString(formData, "description") || null,
    category: readString(formData, "category") || null,
    service_type: serviceType,
    sale_price: salePrice,
    notes: readString(formData, "notes") || null,
    updated_by: profile.id,
    updated_at: new Date().toISOString()
  };

  if (action === "update") {
    const { data: existing } = await supabase
      .from("service_catalog")
      .select("id")
      .eq("id", catalogServiceId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (!existing) return redirectWith(request, "catalog_invalid");

    const { error } = await supabase
      .from("service_catalog")
      .update(payload)
      .eq("id", catalogServiceId)
      .eq("company_id", profile.company_id);
    return redirectWith(request, error ? (error.code === "23505" ? "catalog_duplicate" : "catalog_error") : "catalog_updated");
  }

  const { error } = await supabase.from("service_catalog").insert({
    ...payload,
    company_id: profile.company_id,
    active: true,
    created_by: profile.id
  });
  return redirectWith(request, error ? (error.code === "23505" ? "catalog_duplicate" : "catalog_error") : "catalog_created");
}
