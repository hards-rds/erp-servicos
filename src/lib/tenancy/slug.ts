export function slugifyTenant(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54);
}

export function uniqueTenantSlug(name: string) {
  const base = slugifyTenant(name) || "tenant";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}
