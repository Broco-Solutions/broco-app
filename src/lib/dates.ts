export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string"
    ? (value.includes("T") ? new Date(value.slice(0, 10) + "T00:00:00") : new Date(value + "T00:00:00"))
    : value;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateShort(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string"
    ? (value.includes("T") ? new Date(value.slice(0, 10) + "T00:00:00") : new Date(value + "T00:00:00"))
    : value;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

export function toInputDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

export function monthLabel(m: number, y: number): string {
  return new Date(y, m - 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

export function todayArg(): Date {
  const [yy, mm, dd] = todayKeyArgentina().split("-").map(Number);
  return new Date(yy, mm - 1, dd);
}

export function dateOnlyKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (!s) return null;
  // already YYYY-MM-DD or ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function isDateOnlyInRange(
  value: string | Date | null | undefined,
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  const key = dateOnlyKey(value);
  if (!key) return false;
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

export function calendarDateKeyInTimeZone(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  if (!year || !month || !day) throw new Error("No se pudo determinar la fecha calendario.");
  return `${year}-${month}-${day}`;
}

export function todayKeyArgentina(now = new Date()): string {
  return calendarDateKeyInTimeZone("America/Argentina/Cordoba", now);
}

export function isValidCalendarDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function toUtcDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
