export type MoneyInput = number | string;

export function toCents(value: MoneyInput): number {
  if (typeof value === "number") return Math.round(value * 100);
  const normalized = value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  return Math.round(Number(normalized || 0) * 100);
}

export function formatMoneyBRL(value: MoneyInput): string {
  const cents = toCents(value);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
