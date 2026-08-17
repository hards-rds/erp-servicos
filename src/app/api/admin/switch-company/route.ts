import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function redirectTo(request: NextRequest, path: string, status?: string) {
  const safePath = path.startsWith("/") && !path.startsWith("//") ? path : "/dashboard";
  const url = new URL(safePath, request.url);
  if (status) url.searchParams.set("status", status);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  const formData = await request.formData();
  const companyId = String(formData.get("companyId") || "").trim();
  const redirectPath = String(formData.get("redirectTo") || "/dashboard");

  if (!companyId) {
    return redirectTo(request, "/admin/tenants", "missing_company");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,role,active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.active === false) {
    return redirectTo(request, "/admin/tenants", "forbidden");
  }

  const service = createServiceClient();
  const { data: company } = await service
    .from("companies")
    .select("id,tenant_id,active")
    .eq("id", companyId)
    .maybeSingle();

  if (!company || company.active === false) {
    return redirectTo(request, "/admin/tenants", "missing_company");
  }

  let canSwitch = profile.role === "system_admin";
  if (!canSwitch) {
    const { data: membership } = await service
      .from("company_members")
      .select("company_id")
      .eq("company_id", company.id)
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();
    canSwitch = Boolean(membership);
  }

  if (!canSwitch) {
    return redirectTo(request, "/admin/tenants", "forbidden");
  }

  const { error } = await service
    .from("profiles")
    .update({
      tenant_id: company.tenant_id,
      company_id: company.id,
      updated_at: new Date().toISOString()
    })
    .eq("id", user.id);

  if (error) {
    return redirectTo(request, "/admin/tenants", "error");
  }

  return redirectTo(request, redirectPath, "switched");
}
