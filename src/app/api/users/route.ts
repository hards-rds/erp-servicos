import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/configuracoes/usuarios?user=${status}`, request.url), 303);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function getMasterActor() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return { actor: null, error: "unauthorized" };

  const { data: actor } = await supabase
    .from("profiles")
    .select("id,tenant_id,company_id,role,active")
    .eq("id", user.id)
    .maybeSingle();

  if (!actor?.company_id || !actor.tenant_id || !["master", "system_admin"].includes(actor.role) || actor.active === false) {
    return { actor: null, error: "forbidden" };
  }

  return { actor, error: null };
}

async function replaceUserGroups(service: ReturnType<typeof createServiceClient>, userId: string, groupIds: string[]) {
  await service.from("user_groups").delete().eq("user_id", userId);

  if (!groupIds.length) return null;

  const { error } = await service.from("user_groups").insert(
    groupIds.map((groupId) => ({
      user_id: userId,
      group_id: groupId
    }))
  );

  return error;
}

export async function POST(request: NextRequest) {
  const { actor, error: actorError } = await getMasterActor();
  if (actorError === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
  if (!actor) return redirectWith(request, "forbidden");

  const formData = await request.formData();
  const action = String(formData.get("action") || "create").trim();
  const service = createServiceClient();

  if (action === "create") {
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const name = String(formData.get("name") || "").trim();
    const password = String(formData.get("password") || "");
    const role = String(formData.get("role") || "usuario").trim();
    const groupIds = formData.getAll("groupIds").map(String).filter(Boolean);

    if (!isEmail(email) || !name || password.length < 8 || !["usuario", "admin", "master"].includes(role)) {
      return redirectWith(request, "invalid");
    }

    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name }
    });

    if (createError || !created.user) {
      return redirectWith(request, createError?.message.toLowerCase().includes("already") ? "duplicate" : "error");
    }

    const { error: profileError } = await service.from("profiles").upsert({
      id: created.user.id,
      tenant_id: actor.tenant_id,
      company_id: actor.company_id,
      email,
      name,
      role,
      active: true,
      updated_at: new Date().toISOString()
    });

    if (profileError) return redirectWith(request, "error");

    if (actor.tenant_id) {
      await service.from("tenant_members").upsert({
        tenant_id: actor.tenant_id,
        user_id: created.user.id,
        role: role === "master" ? "owner" : role === "admin" ? "admin" : "member",
        active: true,
        updated_at: new Date().toISOString()
      });
    }

    await service.from("company_members").upsert({
      company_id: actor.company_id,
      user_id: created.user.id,
      role: role === "master" ? "owner" : role === "admin" ? "admin" : "member",
      active: true,
      updated_at: new Date().toISOString()
    });

    const groupError = await replaceUserGroups(service, created.user.id, groupIds);
    return redirectWith(request, groupError ? "group_error" : "created");
  }

  if (action === "status") {
    const userId = String(formData.get("userId") || "").trim();
    const active = String(formData.get("active") || "") === "true";

    if (!userId || userId === actor.id) return redirectWith(request, "invalid_status");

    const { error } = await service
      .from("profiles")
      .update({ active, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .eq("company_id", actor.company_id);

    await service
      .from("tenant_members")
      .update({ active, updated_at: new Date().toISOString() })
      .eq("tenant_id", actor.tenant_id)
      .eq("user_id", userId);

    await service
      .from("company_members")
      .update({ active, updated_at: new Date().toISOString() })
      .eq("company_id", actor.company_id)
      .eq("user_id", userId);

    return redirectWith(request, error ? "error" : active ? "activated" : "deactivated");
  }

  if (action === "groups") {
    const userId = String(formData.get("userId") || "").trim();
    const role = String(formData.get("role") || "usuario").trim();
    const groupIds = formData.getAll("groupIds").map(String).filter(Boolean);

    if (!userId || !["usuario", "admin", "master"].includes(role)) return redirectWith(request, "invalid");

    const { error: profileError } = await service
      .from("profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .eq("company_id", actor.company_id);

    if (profileError) return redirectWith(request, "error");

    await service.from("tenant_members").upsert({
      tenant_id: actor.tenant_id,
      user_id: userId,
      role: role === "master" ? "owner" : role === "admin" ? "admin" : "member",
      active: true,
      updated_at: new Date().toISOString()
    });

    await service.from("company_members").upsert({
      company_id: actor.company_id,
      user_id: userId,
      role: role === "master" ? "owner" : role === "admin" ? "admin" : "member",
      active: true,
      updated_at: new Date().toISOString()
    });

    const groupError = await replaceUserGroups(service, userId, groupIds);
    return redirectWith(request, groupError ? "group_error" : "updated");
  }

  return redirectWith(request, "invalid");
}
