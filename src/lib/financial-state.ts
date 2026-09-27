import { isValidCalendarDateKey } from "@/lib/dates";

export type FinancialStatus = "PENDING" | "PAID";

export function canonicalFinancialDates(
  status: FinancialStatus,
  dueDate: string | null | undefined,
  effectiveDate: string | null | undefined,
  paidDateLabel: string,
) {
  if (status === "PENDING") {
    if (!dueDate) throw new Error("La fecha de vencimiento es obligatoria para registros pendientes.");
    if (!isValidCalendarDateKey(dueDate)) throw new Error("La fecha de vencimiento no es válida.");
    return { dueDate, effectiveDate: null };
  }
  if (!effectiveDate) throw new Error(`La fecha de ${paidDateLabel} es obligatoria para registros pagados.`);
  if (!isValidCalendarDateKey(effectiveDate)) throw new Error(`La fecha de ${paidDateLabel} no es válida.`);
  return { dueDate: null, effectiveDate };
}
