function parseWholeNumber(value: unknown, field: "hours" | "minutes") {
  const normalized = String(value ?? "").trim();
  if (!normalized) return 0;
  const label = field === "hours" ? "Las horas" : "Los minutos";
  if (!/^\d+$/.test(normalized)) throw new Error(`${label} deben ser un número entero.`);
  return Number(normalized);
}

/** Shared validation for human forms and structured MCP duration input. */
export function parseTimeDurationFields(rawHours: unknown, rawMinutes: unknown): number {
  const hours = parseWholeNumber(rawHours, "hours");
  const minutes = parseWholeNumber(rawMinutes, "minutes");
  if (hours > 24) throw new Error("Las horas deben estar entre 0 y 24.");
  if (minutes > 59) throw new Error("Los minutos deben estar entre 0 y 59.");

  const totalMinutes = hours * 60 + minutes;
  if (totalMinutes <= 0) throw new Error("Ingresá al menos 1 minuto.");
  if (totalMinutes > 1440) throw new Error("La duración total no puede superar 24 horas.");
  return totalMinutes;
}

export function splitTimeMinutes(totalMinutes: number) {
  if (!Number.isInteger(totalMinutes) || totalMinutes < 0) throw new Error("La duración en minutos no es válida.");
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

export function formatTimeMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours} h${remainder ? ` ${String(remainder).padStart(2, "0")} min` : ""}` : `${remainder} min`;
}
