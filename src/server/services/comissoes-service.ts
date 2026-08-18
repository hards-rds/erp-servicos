import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateCommissionAmount } from "@/domains/finance/commissions";

type SourceType = "venda" | "servico";

type SyncSourceCommissionInput = {
  supabase: SupabaseClient;
  companyId: string;
  profileId: string;
  sellerId: string | null;
  sourceType: SourceType;
  sourceId: string;
  referenceDate: string;
  description: string;
  baseAmount: number;
  ratePercent: number | null;
  dueDate: string;
  canceled?: boolean;
};

export async function syncSourceCommission(input: SyncSourceCommissionInput) {
  const sourceColumn = input.sourceType === "venda" ? "sale_id" : "service_record_id";
  const { data: existing, error: lookupError } = await input.supabase
    .from("commissions")
    .select("id,status,payable_id")
    .eq("company_id", input.companyId)
    .eq(sourceColumn, input.sourceId)
    .maybeSingle();

  if (lookupError) return { error: lookupError };

  const shouldCancel = input.canceled || input.baseAmount <= 0 || !input.sellerId || !input.ratePercent || input.ratePercent <= 0;
  if (shouldCancel) {
    if (!existing || ["paga", "cancelada"].includes(existing.status)) return { error: null };

    const { error } = await input.supabase
      .from("commissions")
      .update({ status: "cancelada", updated_by: input.profileId, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("company_id", input.companyId);

    if (!error && existing.payable_id) {
      await input.supabase
        .from("payables")
        .update({ status: "cancelado", updated_by: input.profileId, updated_at: new Date().toISOString() })
        .eq("id", existing.payable_id)
        .eq("company_id", input.companyId)
        .neq("status", "pago");
    }

    return { error };
  }

  const ratePercent = input.ratePercent;
  if (ratePercent === null || ratePercent > 100) return { error: new Error("Percentual da comissao invalido.") };

  const { data: seller } = await input.supabase
    .from("profiles")
    .select("id")
    .eq("id", input.sellerId)
    .eq("company_id", input.companyId)
    .eq("active", true)
    .maybeSingle();

  if (!seller) return { error: new Error("Vendedor nao pertence a empresa ativa.") };
  if (existing && existing.status !== "pendente") return { error: null };

  const commissionAmount = calculateCommissionAmount(input.baseAmount, ratePercent);
  const payload = {
    company_id: input.companyId,
    seller_id: input.sellerId,
    source_type: input.sourceType,
    reference_date: input.referenceDate,
    description: input.description,
    base_amount: input.baseAmount,
    rate_percent: ratePercent,
    commission_amount: commissionAmount,
    due_date: input.dueDate,
    notes: `Comissao gerada automaticamente pela ${input.sourceType}.`,
    updated_by: input.profileId,
    updated_at: new Date().toISOString()
  };

  if (existing) {
    const { error } = await input.supabase
      .from("commissions")
      .update(payload)
      .eq("id", existing.id)
      .eq("company_id", input.companyId)
      .eq("status", "pendente");
    return { error };
  }

  const { error } = await input.supabase.from("commissions").insert({
    ...payload,
    [sourceColumn]: input.sourceId,
    status: "pendente",
    created_by: input.profileId
  });

  return { error };
}
