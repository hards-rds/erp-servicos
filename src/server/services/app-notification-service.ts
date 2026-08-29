import type { SupabaseClient } from "@supabase/supabase-js";

export async function notifyCompany(input: {
  supabase: SupabaseClient;
  companyId: string;
  category: "recorrencia" | "financeiro" | "fiscal" | "cobranca" | "sistema";
  severity: "info" | "sucesso" | "aviso" | "erro";
  title: string;
  message: string;
  dedupeKey: string;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  profileId?: string | null;
}) {
  const { error } = await input.supabase.from("app_notifications").upsert({
    company_id: input.companyId,
    profile_id: input.profileId || null,
    category: input.category,
    severity: input.severity,
    title: input.title,
    message: input.message,
    link: input.link || null,
    entity_type: input.entityType || null,
    entity_id: input.entityId || null,
    dedupe_key: input.dedupeKey
  }, { onConflict: "company_id,dedupe_key", ignoreDuplicates: true });
  return !error;
}
