import "server-only";

import type { PermissionAction } from "@/lib/auth/api-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getSchoolContext(action: PermissionAction = "visualizar") {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null, company: null, allowed: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,tenant_id,company_id,active")
    .eq("id", user.id)
    .maybeSingle();

  const { data: company } = profile?.company_id
    ? await supabase
      .from("companies")
      .select("id,service_segment,active")
      .eq("id", profile.company_id)
      .maybeSingle()
    : { data: null };
  const { data: hasPermission } = profile?.company_id
    ? await supabase.rpc("app_has_permission", {
      permission_module: "escola",
      permission_action: action
    })
    : { data: false };

  return {
    supabase,
    user,
    profile,
    company,
    allowed: Boolean(
      profile?.active !== false
      && company?.active !== false
      && company?.service_segment === "escola_futebol"
      && hasPermission === true
    )
  };
}

export function parseSchoolMoney(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

export function schoolScore(value: string) {
  if (!value) return null;
  const score = Number(value.replace(",", "."));
  return Number.isFinite(score) && score >= 0 && score <= 10 ? score : null;
}
