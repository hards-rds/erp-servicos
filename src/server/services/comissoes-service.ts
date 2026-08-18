import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateCommissionAmount } from "@/domains/finance/commissions";
import { selectCommissionRate, type CommissionRule } from "@/domains/finance/commission-rules";

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

type ResolveCommissionRateInput = {
  supabase: SupabaseClient;
  companyId: string;
  sellerId: string;
  sourceType: SourceType;
  itemKey: string;
};

export async function resolveSellerCommissionRate(input: ResolveCommissionRateInput) {
  const { data: seller, error: sellerError } = await input.supabase
    .from("commission_sellers")
    .select("id,profile_id")
    .eq("id", input.sellerId)
    .eq("company_id", input.companyId)
    .eq("active", true)
    .maybeSingle();

  if (sellerError) return { seller: null, ratePercent: null, error: sellerError };
  if (!seller) return { seller: null, ratePercent: null, error: new Error("Vendedor nao pertence a empresa ativa.") };

  const { data: rules, error: rulesError } = await input.supabase
    .from("seller_commission_rules")
    .select("source_type,item_key,rate_percent,active")
    .eq("company_id", input.companyId)
    .eq("commission_seller_id", seller.id)
    .eq("source_type", input.sourceType)
    .eq("active", true)
    .in("item_key", [input.itemKey, "*"]);

  if (rulesError) return { seller, ratePercent: null, error: rulesError };
  const ratePercent = selectCommissionRate((rules || []) as CommissionRule[], {
    sourceType: input.sourceType,
    itemKey: input.itemKey
  });
  if (ratePercent === null) {
    return { seller, ratePercent: null, error: new Error("Nenhuma regra de comissao foi configurada para este item.") };
  }

  return { seller, ratePercent, error: null };
}

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
    .from("commission_sellers")
    .select("id,profile_id")
    .eq("id", input.sellerId)
    .eq("company_id", input.companyId)
    .eq("active", true)
    .maybeSingle();

  if (!seller) return { error: new Error("Vendedor nao pertence a empresa ativa.") };
  if (existing && existing.status !== "pendente") return { error: null };

  const commissionAmount = calculateCommissionAmount(input.baseAmount, ratePercent);
  const payload = {
    company_id: input.companyId,
    commission_seller_id: seller.id,
    seller_id: seller.profile_id,
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
