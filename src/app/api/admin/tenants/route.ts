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
  const action = String(formData.get("action") || "create").trim();
  const service = createServiceClient();

  if (action === "update") {
    const tenantId = String(formData.get("tenantId") || "").trim();
    const companyId = String(formData.get("companyId") || "").trim();
    const masterUserId = String(formData.get("masterUserId") || "").trim();
    const tenantName = String(formData.get("tenantName") || "").trim();
    const companyName = String(formData.get("companyName") || "").trim();
    const companyDocument = onlyDigits(String(formData.get("companyDocument") || ""));
    const masterName = String(formData.get("masterName") || "").trim();
    const serviceSegment = String(formData.get("serviceSegment") || "").trim();
    const plan = String(formData.get("plan") || "").trim();
    const tenantStatus = String(formData.get("tenantStatus") || "").trim();
    const companyActive = String(formData.get("companyActive") || "") === "true";

    if (
      !tenantId
      || !companyId
      || !tenantName
      || !companyName
      || !["starter", "pro", "enterprise"].includes(plan)
      || !["active", "trial", "suspended", "cancelled"].includes(tenantStatus)
      || !["tecnologia", "otica", "generico"].includes(serviceSegment)
      || (masterUserId && !masterName)
    ) {
      return redirectWith(request, "update_invalid");
    }

    const [{ data: tenant }, { data: company }] = await Promise.all([
      service.from("tenants").select("id").eq("id", tenantId).maybeSingle(),
      service.from("companies").select("id,tenant_id").eq("id", companyId).eq("tenant_id", tenantId).maybeSingle()
    ]);
    if (!tenant || !company) return redirectWith(request, "update_not_found");

    if (masterUserId) {
      const { data: membership } = await service
        .from("tenant_members")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .eq("user_id", masterUserId)
        .eq("active", true)
        .maybeSingle();
      if (!membership) return redirectWith(request, "update_not_found");

      const { error: authError } = await service.auth.admin.updateUserById(masterUserId, {
        user_metadata: { name: masterName }
      });
      if (authError) return redirectWith(request, "error");
    }

    const now = new Date().toISOString();
    const [tenantResult, companyResult, profileResult] = await Promise.all([
      service
        .from("tenants")
        .update({ name: tenantName, plan, status: tenantStatus, updated_at: now })
        .eq("id", tenantId),
      service
        .from("companies")
        .update({
          name: companyName,
          document: companyDocument || null,
          service_segment: serviceSegment,
          active: companyActive,
          updated_at: now
        })
        .eq("id", companyId)
        .eq("tenant_id", tenantId),
      masterUserId
        ? service
            .from("profiles")
            .update({ name: masterName, updated_at: now })
            .eq("id", masterUserId)
            .eq("tenant_id", tenantId)
        : Promise.resolve({ error: null })
    ]);
    if (tenantResult.error || companyResult.error || profileResult.error) {
      return redirectWith(request, "error");
    }

    return redirectWith(request, "updated");
  }

  if (action !== "create") return redirectWith(request, "invalid");

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
