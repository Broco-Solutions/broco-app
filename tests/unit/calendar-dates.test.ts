import { describe, expect, it } from "vitest";
import { isValidCalendarDateKey, todayKeyArgentina } from "@/lib/dates";

describe("fechas calendario", () => {
  it("obtiene la fecha operativa de Córdoba aun cuando UTC ya cambió de día", () => {
    expect(todayKeyArgentina(new Date("2026-09-28T00:30:00.000Z"))).toBe("2026-09-27");
  });

  it.each(["2026-02-30", "2026-13-01", "2026-00-10", "2026-01-00", "2026/01/01"]) ("rechaza %s", (value) => {
    expect(isValidCalendarDateKey(value)).toBe(false);
  });

  it("acepta una fecha calendario válida", () => {
    expect(isValidCalendarDateKey("2026-02-28")).toBe(true);
  });
});
