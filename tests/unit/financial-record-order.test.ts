import { describe, expect, it } from "vitest";
import { compareFinancialRecords } from "@/lib/financial-record-order";

const record = (status: string, date: string, amountUsd = 100, concept = date) => ({
  status,
  concept,
  amountUsd,
  dueDate: status === "PAID" ? null : date,
  effectiveDate: status === "PAID" ? date : null,
});

describe("compareFinancialRecords", () => {
  const older = record("PAID", "2026-01-01");
  const newer = record("PAID", "2026-02-01");

  it("recomienda próximos vencimientos primero para pendientes", () => {
    expect(compareFinancialRecords(record("PENDING", "2028-01-01"), record("PENDING", "2026-10-01"), "PENDING", "auto")).toBeGreaterThan(0);
  });

  it("recomienda cobros recientes primero", () => {
    expect(compareFinancialRecords(newer, older, "PAID", "auto")).toBeLessThan(0);
  });

  it("recomienda vencidos más antiguos primero y todos en orden ascendente", () => {
    expect(compareFinancialRecords(record("PENDING", "2026-01-01"), record("PENDING", "2026-02-01"), "OVERDUE", "auto")).toBeLessThan(0);
    expect(compareFinancialRecords(older, newer, "all", "auto")).toBeLessThan(0);
  });
});
