export function parseCommissionClients(scope: string, values: FormDataEntryValue[]) {
  if (scope === "all") return { valid: true as const, clientIds: null };
  const ids = [...new Set(values.map((value) => String(value).trim().toLowerCase()))];
  if (scope !== "selected" || !ids.length || ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))) {
    return { valid: false as const, clientIds: null };
  }
  return { valid: true as const, clientIds: ids };
}
