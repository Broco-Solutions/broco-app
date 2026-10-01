export type TimeDurationUnit = "MINUTES" | "HOURS";

export function parseTimeDuration(rawValue: FormDataEntryValue | null, rawUnit: FormDataEntryValue | null): number {
  const unit = String(rawUnit ?? "MINUTES");
  if (unit !== "MINUTES" && unit !== "HOURS") throw new Error("La unidad de duración no es válida.");

  const amount = Number(String(rawValue ?? "").replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("La duración debe ser positiva.");
  if (unit === "MINUTES" && !Number.isInteger(amount)) throw new Error("Los minutos deben ser un número entero.");

  const exactMinutes = unit === "HOURS" ? amount * 60 : amount;
  const minutes = Math.round(exactMinutes);
  if (minutes !== exactMinutes) {
    throw new Error(`La duración se redondearía a ${minutes} minutos. Ajustá el valor antes de guardar.`);
  }
  if (minutes > 1440) throw new Error("La duración no puede superar 24 horas.");
  return minutes;
}

export function previewTimeDuration(rawValue: string, unit: TimeDurationUnit): number | null {
  const amount = Number(rawValue.replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * (unit === "HOURS" ? 60 : 1));
}

export function formatTimeMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours} h${remainder ? ` ${remainder} min` : ""}` : `${remainder} min`;
}
