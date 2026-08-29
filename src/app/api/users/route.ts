import { NextRequest, NextResponse } from "next/server";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";
import { createServiceClient } from "@/lib/supabase/server";
import { canCreateTenantResource } from "@/server/services/saas-plan-service";

export const runtime = "nodejs";

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/configuracoes/usuarios?user=${status}`, request.url), 303);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function replaceUserGroups(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
  companyId: string,
  groupIds: string[]
) {
  const uniqueGroupIds = [...new Set(groupIds)];
  if (uniqueGroupIds.length) {
    const { data: validGroups, error: groupLookupError } = await service
      .from("groups")
      .select("id")
      .eq("company_id", companyId)
      .in("id", uniqueGroupIds);

    if (groupLookupError || validGroups?.length !== uniqueGroupIds.length) {
      return groupLookupError || new Error("Grupo de acesso fora da empresa ativa.");
    }
  }

  await service.from("user_groups").delete().eq("user_id", userId);

  if (!uniqueGroupIds.length) return null;

  const { error } = await service.from("user_groups").insert(
    uniqueGroupIds.map((groupId) => ({
      user_id: userId,
      group_id: groupId
    }))
  );

  return error;
}

export async function POST(request: NextRequest) {
  const access = await requireCompanyPermission({ module: "configuracoes.usuarios", action: "configurar", roles: ["master", "system_admin"] });
  if (!access.ok) {
    if (access.reason === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
    return redirectWith(request, access.reason === "forbidden" ? "forbidden" : "profile_error");
  }
  const actor = access.profile;

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

    const capacity = await canCreateTenantResource(actor.tenant_id, "users");
    if (!capacity.allowed) return redirectWith(request, "plan_limit");

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
      const { error: tenantMemberError } = await service.from("tenant_members").upsert({
        tenant_id: actor.tenant_id,
        user_id: created.user.id,
        role: role === "master" ? "owner" : role === "admin" ? "admin" : "member",
        active: true,
        updated_at: new Date().toISOString()
      });
      if (tenantMemberError) {
        await service.from("profiles").delete().eq("id", created.user.id).eq("tenant_id", actor.tenant_id);
        await service.auth.admin.deleteUser(created.user.id);
        return redirectWith(request, tenantMemberError.message.includes("plan_limit:") ? "plan_limit" : "error");
      }
    }

    await service.from("company_members").upsert({
      company_id: actor.company_id,
      user_id: created.user.id,
      role: role === "master" ? "owner" : role === "admin" ? "admin" : "member",
      active: true,
      updated_at: new Date().toISOString()
    });

    const groupError = await replaceUserGroups(service, created.user.id, actor.company_id, groupIds);
    if (!groupError) await writeCompanyAudit({ companyId: actor.company_id, actorId: actor.id, entity: "user", entityId: created.user.id, action: "create", metadata: { role, groupIds } });
    return redirectWith(request, groupError ? "group_error" : "created");
  }

  if (action === "status") {
    const userId = String(formData.get("userId") || "").trim();
    const active = String(formData.get("active") || "") === "true";

    if (!userId || userId === actor.id) return redirectWith(request, "invalid_status");
    if (active) {
      const capacity = await canCreateTenantResource(actor.tenant_id, "users");
      if (!capacity.allowed) return redirectWith(request, "plan_limit");
    }
    const { data: targetUser } = await service
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .eq("company_id", actor.company_id)
      .maybeSingle();
    if (!targetUser) return redirectWith(request, "invalid_status");

    const { error: tenantMemberError } = await service
      .from("tenant_members")
      .update({ active, updated_at: new Date().toISOString() })
      .eq("tenant_id", actor.tenant_id)
      .eq("user_id", userId);
    if (tenantMemberError) return redirectWith(request, tenantMemberError.message.includes("plan_limit:") ? "plan_limit" : "error");

    const { error } = await service
      .from("profiles")
      .update({ active, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .eq("company_id", actor.company_id);

    await service
      .from("company_members")
      .update({ active, updated_at: new Date().toISOString() })
      .eq("company_id", actor.company_id)
      .eq("user_id", userId);

    if (!error) await writeCompanyAudit({ companyId: actor.company_id, actorId: actor.id, entity: "user", entityId: userId, action: active ? "activate" : "deactivate" });

    return redirectWith(request, error ? "error" : active ? "activated" : "deactivated");
  }

  if (action === "groups") {
    const userId = String(formData.get("userId") || "").trim();
    const role = String(formData.get("role") || "usuario").trim();
    const groupIds = formData.getAll("groupIds").map(String).filter(Boolean);

    if (!userId || !["usuario", "admin", "master"].includes(role)) return redirectWith(request, "invalid");
    const { data: targetUser } = await service
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .eq("company_id", actor.company_id)
      .maybeSingle();
    if (!targetUser) return redirectWith(request, "invalid");

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

    const groupError = await replaceUserGroups(service, userId, actor.company_id, groupIds);
    if (!groupError) await writeCompanyAudit({ companyId: actor.company_id, actorId: actor.id, entity: "user", entityId: userId, action: "update_access", metadata: { role, groupIds } });
    return redirectWith(request, groupError ? "group_error" : "updated");
  }

  return redirectWith(request, "invalid");
}
