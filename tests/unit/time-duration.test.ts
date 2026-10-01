import { describe, expect, it } from "vitest";
import { parseTimeDuration } from "@/lib/time-duration";

describe("parseTimeDuration", () => {
  it("mantiene la carga entera en minutos", () => {
    expect(parseTimeDuration("45", "MINUTES")).toBe(45);
  });

  it("convierte horas decimales con coma o punto", () => {
    expect(parseTimeDuration("1,5", "HOURS")).toBe(90);
    expect(parseTimeDuration("1.25", "HOURS")).toBe(75);
  });

  it("rechaza fracciones de minuto", () => {
    expect(() => parseTimeDuration("1,5", "MINUTES")).toThrow("número entero");
  });

  it("rechaza valores que requerirían redondeo", () => {
    expect(() => parseTimeDuration("0,01", "HOURS")).toThrow("se redondearía");
  });

  it("rechaza duraciones mayores a 24 horas", () => {
    expect(() => parseTimeDuration("24,1", "HOURS")).toThrow("24 horas");
  });

  it("rechaza unidades manipuladas", () => {
    expect(() => parseTimeDuration("10", "DAYS")).toThrow("unidad");
  });
});
