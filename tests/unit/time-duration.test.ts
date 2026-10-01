import { describe, expect, it } from "vitest";
import { formatTimeMinutes, parseTimeDurationFields, splitTimeMinutes } from "@/lib/time-duration";

describe("duración de registros de tiempo", () => {
  it("acepta sólo horas", () => {
    expect(parseTimeDurationFields("3", "")).toBe(180);
  });

  it("acepta sólo minutos", () => {
    expect(parseTimeDurationFields("", "45")).toBe(45);
  });

  it("suma horas y minutos", () => {
    expect(parseTimeDurationFields("2", "30")).toBe(150);
  });

  it("rechaza ambos campos vacíos o en cero", () => {
    expect(() => parseTimeDurationFields("", "")).toThrow("al menos 1 minuto");
    expect(() => parseTimeDurationFields("0", "0")).toThrow("al menos 1 minuto");
  });

  it("acepta 59 minutos y rechaza 60", () => {
    expect(parseTimeDurationFields("0", "59")).toBe(59);
    expect(() => parseTimeDurationFields("0", "60")).toThrow("entre 0 y 59");
  });

  it("acepta 24 h 00 min y rechaza 24 h 01 min", () => {
    expect(parseTimeDurationFields("24", "0")).toBe(1440);
    expect(() => parseTimeDurationFields("24", "1")).toThrow("no puede superar 24 horas");
  });

  it("rechaza negativos, decimales y texto", () => {
    expect(() => parseTimeDurationFields("-1", "0")).toThrow("número entero");
    expect(() => parseTimeDurationFields("1,5", "0")).toThrow("número entero");
    expect(() => parseTimeDurationFields("1.5", "0")).toThrow("número entero");
    expect(() => parseTimeDurationFields("una", "0")).toThrow("número entero");
  });

  it("rechaza más de 24 horas", () => {
    expect(() => parseTimeDurationFields("25", "0")).toThrow("entre 0 y 24");
  });

  it("convierte minutos persistidos para edición", () => {
    expect(splitTimeMinutes(95)).toEqual({ hours: 1, minutes: 35 });
  });

  it("formatea la lectura sin decimales", () => {
    expect(formatTimeMinutes(45)).toBe("45 min");
    expect(formatTimeMinutes(60)).toBe("1 h");
    expect(formatTimeMinutes(90)).toBe("1 h 30 min");
    expect(formatTimeMinutes(485)).toBe("8 h 05 min");
  });
});
