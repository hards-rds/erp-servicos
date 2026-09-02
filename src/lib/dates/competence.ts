export function competenceFromDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

const competencePattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export function currentCompetence(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : competenceFromDate(date);
}

export function resolveCompetence(value?: string, date = new Date()): string {
  return value && competencePattern.test(value) ? value : currentCompetence(date);
}

export function shiftCompetence(competence: string, offset: number): string {
  const resolved = resolveCompetence(competence);
  const [year, month] = resolved.split("-").map(Number);
  return competenceFromDate(new Date(Date.UTC(year, month - 1 + offset, 1)));
}

export function competenceDateRange(competence: string) {
  const resolved = resolveCompetence(competence);
  return {
    start: `${resolved}-01`,
    next: `${shiftCompetence(resolved, 1)}-01`
  };
}

export function formatCompetence(competence: string): string {
  const [year, month] = resolveCompetence(competence).split("-").map(Number);
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function dueDateForCompetence(competence: string, dueDay: number): string {
  const [year, month] = competence.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(Math.max(dueDay, 1), lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
