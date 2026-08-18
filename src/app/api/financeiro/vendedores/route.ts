import { NextRequest, NextResponse } from "next/server";
import { serviceTypeOptions, type ServiceSegment } from "@/domains/services/catalog";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function parseRate(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const rate = Number(normalized);
  return Number.isFinite(rate) ? rate : null;
}

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/financeiro/comissoes/vendedores?status=${status}`, request.url), 303);
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

  if (action === "create_seller") {
    const name = readString(formData, "name");
    const email = readString(formData, "email") || null;
    const phone = readString(formData, "phone") || null;
    const profileId = readString(formData, "profileId") || null;
    if (!name || (email && !/^\S+@\S+\.\S+$/.test(email))) return redirectWith(request, "invalid_seller");

    if (profileId) {
      const { data: linkedProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", profileId)
        .eq("company_id", profile.company_id)
        .maybeSingle();
      if (!linkedProfile) return redirectWith(request, "invalid_profile");
    }

    const { error } = await supabase.from("commission_sellers").insert({
      company_id: profile.company_id,
      profile_id: profileId,
      name,
      email,
      phone,
      notes: readString(formData, "notes") || null,
      active: true,
      created_by: profile.id,
      updated_by: profile.id
    });
    return redirectWith(request, error ? (error.code === "23505" ? "duplicate_seller" : "error") : "seller_created");
  }

  if (action === "toggle_seller") {
    const sellerId = readString(formData, "sellerId");
    const active = readString(formData, "active") === "true";
    if (!sellerId) return redirectWith(request, "invalid_seller");
    const { error } = await supabase
      .from("commission_sellers")
      .update({ active, updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("id", sellerId)
      .eq("company_id", profile.company_id);
    return redirectWith(request, error ? "error" : "seller_updated");
  }

  if (action === "save_rule") {
    const sellerId = readString(formData, "sellerId");
    const sourceType = readString(formData, "sourceType");
    const ratePercent = parseRate(readString(formData, "ratePercent"));
    if (!sellerId || !["venda", "servico"].includes(sourceType) || ratePercent === null || ratePercent <= 0 || ratePercent > 100) {
      return redirectWith(request, "invalid_rule");
    }

    const { data: seller } = await supabase
      .from("commission_sellers")
      .select("id")
      .eq("id", sellerId)
      .eq("company_id", profile.company_id)
      .eq("active", true)
      .maybeSingle();
    if (!seller) return redirectWith(request, "invalid_seller");

    let productId: string | null = null;
    let serviceType: string | null = null;
    let itemKey = "*";

    if (sourceType === "venda") {
      productId = readString(formData, "productId") || null;
      if (productId) {
        const { data: product } = await supabase
          .from("products")
          .select("id")
          .eq("id", productId)
          .eq("company_id", profile.company_id)
          .eq("active", true)
          .maybeSingle();
        if (!product) return redirectWith(request, "invalid_item");
        itemKey = product.id;
      }
    } else {
      serviceType = readString(formData, "serviceType") || null;
      if (serviceType) {
        const { data: company } = await supabase
          .from("companies")
          .select("service_segment")
          .eq("id", profile.company_id)
          .maybeSingle();
        const segment = (company?.service_segment || "tecnologia") as ServiceSegment;
        const allowedTypes = new Set((serviceTypeOptions[segment] || serviceTypeOptions.tecnologia).map((item) => item.value));
        if (!allowedTypes.has(serviceType)) return redirectWith(request, "invalid_item");
        itemKey = serviceType;
      }
    }

    const { error } = await supabase.from("seller_commission_rules").upsert({
      company_id: profile.company_id,
      commission_seller_id: seller.id,
      source_type: sourceType,
      item_key: itemKey,
      product_id: productId,
      service_type: serviceType,
      rate_percent: ratePercent,
      active: true,
      created_by: profile.id,
      updated_by: profile.id,
      updated_at: new Date().toISOString()
    }, { onConflict: "company_id,commission_seller_id,source_type,item_key" });

    return redirectWith(request, error ? "error" : "rule_saved");
  }

  if (action === "delete_rule") {
    const ruleId = readString(formData, "ruleId");
    if (!ruleId) return redirectWith(request, "invalid_rule");
    const { error } = await supabase
      .from("seller_commission_rules")
      .delete()
      .eq("id", ruleId)
      .eq("company_id", profile.company_id);
    return redirectWith(request, error ? "error" : "rule_deleted");
  }

  return redirectWith(request, "invalid");
}
