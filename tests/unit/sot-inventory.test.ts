import { describe, expect, it } from "vitest";
import { compareSotInventories, type SotInventory } from "@/lib/production/sot-inventory";

function inventory(): SotInventory {
  return {
    format: "broco-sot-inventory-v1",
    capturedAt: "2026-09-27T00:00:00.000Z",
    counts: { Client: 1, Project: 2 },
    relationships: { projectsByClient: [{ clientId: "a", count: 2 }] },
  };
}

describe("SOT inventory comparison", () => {
  it("ignores capture time and accepts an exact historical fingerprint", () => {
    const after = { ...inventory(), capturedAt: "2026-09-27T01:00:00.000Z" };
    expect(compareSotInventories(inventory(), after)).toEqual([]);
  });

  it("detects count and relationship changes", () => {
    const after = inventory();
    after.counts.Project = 3;
    after.relationships.projectsByClient = [{ clientId: "a", count: 1 }, { clientId: "b", count: 2 }];
    expect(compareSotInventories(inventory(), after)).toEqual([
      "Conteo distinto: Project.",
      "Relación/agregado distinto: projectsByClient.",
    ]);
  });
});
