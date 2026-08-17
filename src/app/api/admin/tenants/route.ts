import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { uniqueTenantSlug } from "@/lib/tenancy/slug";

export const runtime = "nodejs";

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/admin/tenants?status=${status}`, request.url), 303);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

async function requireSystemAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, reason: "unauthorized" as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,role,active")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "system_admin" || profile.active === false) {
    return { ok: false as const, reason: "forbidden" as const };
  }

  return { ok: true as const, actorId: user.id };
}

export async function POST(request: NextRequest) {
  const access = await requireSystemAdmin();
  if (!access.ok) {
    if (access.reason === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
    return redirectWith(request, "forbidden");
  }

  const formData = await request.formData();
  const tenantName = String(formData.get("tenantName") || "").trim();
  const companyName = String(formData.get("companyName") || tenantName).trim();
  const companyDocument = onlyDigits(String(formData.get("companyDocument") || ""));
  const masterName = String(formData.get("masterName") || "").trim();
  const masterEmail = String(formData.get("masterEmail") || "").trim().toLowerCase();
  const masterPassword = String(formData.get("masterPassword") || "");
  const serviceSegment = String(formData.get("serviceSegment") || "tecnologia").trim();
  const plan = String(formData.get("plan") || "starter").trim();

  if (
    !tenantName
    || !companyName
    || !masterName
    || !isEmail(masterEmail)
    || masterPassword.length < 8
    || !["tecnologia", "otica", "generico"].includes(serviceSegment)
  ) {
    return redirectWith(request, "invalid");
  }

  const service = createServiceClient();
  const { data: authUser, error: userError } = await service.auth.admin.createUser({
    email: masterEmail,
    password: masterPassword,
    email_confirm: true,
    user_metadata: { name: masterName }
  });
  if (userError || !authUser.user) {
    return redirectWith(request, userError?.message.toLowerCase().includes("already") ? "duplicate_user" : "error");
  }

  const { data: tenant, error: tenantError } = await service
    .from("tenants")
    .insert({
      name: tenantName,
      slug: uniqueTenantSlug(tenantName),
      plan,
      status: "active"
    })
    .select("id")
    .single();

  if (tenantError || !tenant?.id) return redirectWith(request, "error");

  const { data: company, error: companyError } = await service
    .from("companies")
    .insert({
      tenant_id: tenant.id,
      name: companyName,
      document: companyDocument || null,
      service_segment: serviceSegment,
      active: true
    })
    .select("id")
    .single();
  if (companyError || !company?.id) return redirectWith(request, "error");

  const { error: seedError } = await service.rpc("seed_default_erp_groups", {
    target_company_id: company.id
  });
  if (seedError) return redirectWith(request, "group_error");

  const { error: profileError } = await service.from("profiles").upsert({
    id: authUser.user.id,
    tenant_id: tenant.id,
    company_id: company.id,
    email: masterEmail,
    name: masterName,
    role: "master",
    active: true,
    updated_at: new Date().toISOString()
  });
  if (profileError) return redirectWith(request, "error");

  await service.from("tenant_members").upsert({
    tenant_id: tenant.id,
    user_id: authUser.user.id,
    role: "owner",
    active: true,
    updated_at: new Date().toISOString()
  });

  await service.from("company_members").upsert({
    company_id: company.id,
    user_id: authUser.user.id,
    role: "owner",
    active: true,
    updated_at: new Date().toISOString()
  });

  const { data: masterGroup } = await service
    .from("groups")
    .select("id")
    .eq("company_id", company.id)
    .eq("name", "Master Geral")
    .maybeSingle();
  if (masterGroup?.id) {
    await service.from("user_groups").upsert({
      user_id: authUser.user.id,
      group_id: masterGroup.id
    });
  }

  return redirectWith(request, "created");
}
