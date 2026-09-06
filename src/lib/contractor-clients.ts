import type { SupabaseClient } from "@supabase/supabase-js";
import { getClientIdentityLabel } from "@/lib/client-identity";
import { fetchAllReportRows } from "@/lib/reports/fetch-all";

export async function loadContractorClients(supabase: SupabaseClient, companyId: string) {
  const clients = await fetchAllReportRows<{ id: string; legal_name: string; document: string | null; address: Record<string, unknown> | null }>(
    (from, to) => supabase.from("clients").select("id,legal_name,document,address")
      .eq("company_id", companyId).order("legal_name").order("id").range(from, to)
  );
  return clients.map((client) => ({ id: client.id, label: getClientIdentityLabel(client) }));
}
