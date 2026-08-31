export type SortDirection = "ascending" | "descending";

const collator = new Intl.Collator("pt-BR", {
  numeric: true,
  sensitivity: "base"
});

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseDate(value: string) {
  const brazilianDate = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (brazilianDate) {
    const [, day, month, year, hour = "0", minute = "0"] = brazilianDate;
    return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  }

  const isoDate = value.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (isoDate) {
    const [, year, month, day = "1"] = isoDate;
    return Date.UTC(Number(year), Number(month) - 1, Number(day));
  }

  return null;
}

function parseNumber(value: string) {
  const day = value.match(/^dia\s+(\d+)$/i);
  if (day) return Number(day[1]);

  const numericValue = value
    .replace(/^R\$\s*/i, "")
    .replace(/%$/, "")
    .trim();

  if (!/^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$|^-?\d+(?:,\d+)?$/.test(numericValue)) return null;
  return Number(numericValue.replace(/\./g, "").replace(",", "."));
}

export function compareTableValues(leftValue: string, rightValue: string) {
  const left = normalizeText(leftValue);
  const right = normalizeText(rightValue);

  if (!left && !right) return 0;
  if (!left || left === "-") return 1;
  if (!right || right === "-") return -1;

  const leftDate = parseDate(left);
  const rightDate = parseDate(right);
  if (leftDate !== null && rightDate !== null) return leftDate - rightDate;

  const leftNumber = parseNumber(left);
  const rightNumber = parseNumber(right);
  if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;

  return collator.compare(left, right);
}

export function sortDirectionMultiplier(direction: SortDirection) {
  return direction === "ascending" ? 1 : -1;
}

export function compareTableValuesInDirection(leftValue: string, rightValue: string, direction: SortDirection) {
  const left = normalizeText(leftValue);
  const right = normalizeText(rightValue);
  const leftIsEmpty = !left || left === "-";
  const rightIsEmpty = !right || right === "-";

  if (leftIsEmpty && rightIsEmpty) return 0;
  if (leftIsEmpty) return 1;
  if (rightIsEmpty) return -1;
  return compareTableValues(left, right) * sortDirectionMultiplier(direction);
}
