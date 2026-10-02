import { describe, expect, it } from "vitest";
import { resolveActiveInternalProject } from "@/lib/internal-project";

describe("proyecto interno activo", () => {
  it("se resuelve únicamente por isInternal e isActive, sin depender de un UUID", () => {
    const project = resolveActiveInternalProject([
      { id: "otro", isActive: true, isInternal: false },
      { id: "uuid-normal", isActive: true, isInternal: true },
    ]);
    expect(project.id).toBe("uuid-normal");
  });

  it("rechaza ausencia o ambigüedad en vez de elegir arbitrariamente", () => {
    expect(() => resolveActiveInternalProject([{ id: "sin", isActive: true, isInternal: false }])).toThrow("No hay un proyecto interno");
    expect(() => resolveActiveInternalProject([
      { id: "uno", isActive: true, isInternal: true },
      { id: "dos", isActive: true, isInternal: true },
    ])).toThrow("más de un proyecto interno");
  });
});
