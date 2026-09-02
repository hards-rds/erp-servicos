export type ClientIdentity = {
  legal_name: string;
  document?: string | null;
  address?: Record<string, unknown> | null;
};

export function formatBrazilianDocument(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }

  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }

  return value?.trim() || "Documento nao informado";
}

function addressValue(address: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = address?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

export function getClientLocation(address?: Record<string, unknown> | null) {
  const city = addressValue(address, ["city", "municipality", "cidade", "municipio"]);
  const state = addressValue(address, ["state", "uf", "estado"]).toUpperCase();

  if (city && state) return `${city}/${state}`;
  return city || state;
}

export function getClientIdentityLabel(client: ClientIdentity) {
  const location = getClientLocation(client.address);
  return [client.legal_name, formatBrazilianDocument(client.document), location].filter(Boolean).join(" - ");
}
