import { describe, expect, it } from "vitest";
import {
  operationalTaskCreateSchema,
  operationalTaskUpdateSchema,
} from "@/server/services/operational-tasks";

describe("enlace de referencia de tareas operativas", () => {
  it("acepta un enlace opcional válido al crear una tarea", () => {
    const input = operationalTaskCreateSchema.parse({
      title: "Revisar certificado",
      referenceUrl: "https://example.com/certificados/123",
    });

    expect(input.referenceUrl).toBe("https://example.com/certificados/123");
  });

  it("permite quitar el enlace y rechaza enlaces inválidos al actualizar", () => {
    const base = { expectedUpdatedAt: "2026-10-02T12:00:00.000Z" };
    expect(operationalTaskUpdateSchema.parse({ ...base, referenceUrl: null }).referenceUrl).toBeNull();
    expect(() => operationalTaskUpdateSchema.parse({ ...base, referenceUrl: "no-es-un-enlace" })).toThrow("El enlace no es válido.");
  });
});
