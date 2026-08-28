export function normalizePlanetChatPhone(value: unknown) {
  const digits = String(value ?? "").trim().replace(/\D/g, "");
  if (!digits) return "";
  return digits.length > 11 ? digits.slice(-11) : digits;
}
