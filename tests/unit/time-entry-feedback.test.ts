import { describe, expect, it } from "vitest";
import { getTimeEntryFeedback } from "@/lib/time-entry-feedback";

describe("feedback de carga de tiempo", () => {
  it("nunca muestra éxito cuando la acción actual falló", () => {
    expect(getTimeEntryFeedback({ saved: true, actionSucceeded: false, actionFailed: true, pending: false })).toBe("error");
  });

  it("limpia los mensajes mientras se inicia un nuevo submit", () => {
    expect(getTimeEntryFeedback({ saved: true, actionSucceeded: false, actionFailed: false, pending: true })).toBeNull();
  });
});
