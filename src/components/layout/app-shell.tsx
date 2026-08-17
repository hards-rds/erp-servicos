import { AppShellClient } from "@/components/layout/app-shell-client";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("name,email,role,company_id,tenant_id").eq("id", user.id).maybeSingle()
    : { data: null };
  const { data: company } = profile?.company_id
    ? await supabase.from("companies").select("name,service_segment").eq("id", profile.company_id).maybeSingle()
    : { data: null };

  return (
    <AppShellClient
      displayName={profile?.name || "Operador"}
      displayEmail={profile?.email || user?.email || "Usuario"}
      displayRole={profile?.role === "system_admin" ? "system_admin" : profile?.role === "master" ? "master" : profile?.role || "sem perfil"}
      activeCompanyName={company?.name || null}
      activeCompanySegment={company?.service_segment || null}
      isSystemAdmin={profile?.role === "system_admin"}
    >
      {children}
    </AppShellClient>
  );
}
