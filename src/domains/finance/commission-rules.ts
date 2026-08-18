export type CommissionRule = {
  source_type: "venda" | "servico";
  item_key: string;
  rate_percent: number | string;
  active?: boolean;
};

export function selectCommissionRate(
  rules: CommissionRule[],
  input: { sourceType: "venda" | "servico"; itemKey?: string | null }
) {
  const activeRules = rules.filter((rule) => rule.active !== false && rule.source_type === input.sourceType);
  const specific = input.itemKey
    ? activeRules.find((rule) => rule.item_key === input.itemKey)
    : null;
  const fallback = activeRules.find((rule) => rule.item_key === "*");
  const selected = specific || fallback;

  if (!selected) return null;
  const rate = Number(selected.rate_percent);
  return Number.isFinite(rate) && rate > 0 && rate <= 100 ? rate : null;
}
