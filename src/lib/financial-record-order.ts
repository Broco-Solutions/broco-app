import { dateOnlyKey } from "@/lib/dates";

export type FinancialRecordSort =
  | "auto"
  | `${FinancialRecordSortKey}-asc`
  | `${FinancialRecordSortKey}-desc`;

export type FinancialRecordSortKey =
  | "concept"
  | "client"
  | "project"
  | "category"
  | "type"
  | "status"
  | "date"
  | "amount"
  | "ars";

export type FinancialRecord = {
  status: string;
  concept: string;
  amountUsd: unknown;
  amountArs?: unknown;
  clientName?: string;
  projectName?: string;
  typeName?: string;
  categoryName?: string;
  dueDate: string | Date | null;
  effectiveDate: string | Date | null;
};

function compareDates(
  a: FinancialRecord,
  b: FinancialRecord,
  direction: "asc" | "desc",
): number {
  const aDate = dateOnlyKey(a.status === "PAID" ? a.effectiveDate : a.dueDate);
  const bDate = dateOnlyKey(b.status === "PAID" ? b.effectiveDate : b.dueDate);

  if (!aDate && !bDate) return 0;
  if (!aDate) return 1;
  if (!bDate) return -1;

  const result = aDate.localeCompare(bDate);
  return direction === "desc" ? -result : result;
}

function compareNumbers(a: unknown, b: unknown): number {
  return Number(a ?? 0) - Number(b ?? 0);
}

export function compareFinancialRecords(
  a: FinancialRecord,
  b: FinancialRecord,
  statusFilter: string,
  sort: FinancialRecordSort,
): number {
  if (sort !== "auto") {
    const [key, direction] = sort.split("-") as [FinancialRecordSortKey, "asc" | "desc"];
    if (key === "date") return compareDates(a, b, direction);
    if (key === "amount") {
      const result = compareNumbers(a.amountUsd, b.amountUsd);
      return direction === "desc" ? -result : result;
    }
    if (key === "ars") {
      const result = compareNumbers(a.amountArs, b.amountArs);
      return direction === "desc" ? -result : result;
    }

    const value = (record: FinancialRecord) => {
      if (key === "concept") return record.concept;
      if (key === "client") return record.clientName ?? "";
      if (key === "project") return record.projectName ?? "";
      if (key === "category") return record.categoryName ?? "";
      if (key === "type") return record.typeName ?? "";
      if (key === "status") return record.status;
      return "";
    };
    const result = value(a).localeCompare(value(b), "es-AR");
    return direction === "desc" ? -result : result;
  }

  // The recommended order follows the workflow of each status:
  // all records oldest-first, pending/overdue by nearest deadline,
  // and paid records most recently collected first.
  return compareDates(a, b, statusFilter === "PAID" ? "desc" : "asc");
}

export function isFinancialRecordSort(value: string | null): value is FinancialRecordSort {
  if (value === "auto") return true;
  if (!value) return false;
  const [key, direction] = value.split("-");
  return (
    ["concept", "client", "project", "category", "type", "status", "date", "amount", "ars"].includes(key) &&
    (direction === "asc" || direction === "desc")
  );
}

export function toggleFinancialRecordSort(
  current: FinancialRecordSort,
  key: FinancialRecordSortKey,
  defaultDirection?: "asc" | "desc",
): FinancialRecordSort {
  if (current !== `${key}-asc` && current !== `${key}-desc`) {
    if (current === "auto" && defaultDirection && key === "date") {
      return `${key}-${defaultDirection === "asc" ? "desc" : "asc"}`;
    }
    return `${key}-asc`;
  }
  if (current.endsWith("-asc")) return `${key}-desc`;
  return "auto";
}
