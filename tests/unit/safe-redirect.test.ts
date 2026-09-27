import { describe, expect, it } from "vitest";
import { safeInternalRedirect } from "@/lib/safe-redirect";

describe("safeInternalRedirect", () => {
  it("accepta rutas internas navegables", () => {
    expect(safeInternalRedirect("/hours")).toBe("/hours");
    expect(safeInternalRedirect("/clients/abc?tab=summary#notes")).toBe("/clients/abc?tab=summary#notes");
  });

  it.each(["javascript:alert(1)", "https://evil.example", "http://evil.example", "//evil.example", "\\\\evil.example", "mailto:test@example.com", "clients/abc", "%2F%2Fevil.example"]) (
    "rechaza redirectTo no interno: %s",
    (value) => expect(safeInternalRedirect(value)).toBe("/"),
  );
});
