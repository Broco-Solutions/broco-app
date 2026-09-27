import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { captureSotInventory, compareSotInventories } from "@/lib/production/sot-inventory";
import { assertLocalTestDatabaseUrl } from "@/lib/test-db-guard";

const testDatabaseUrl = assertLocalTestDatabaseUrl(process.env.DATABASE_URL_TEST);

describe("SOT production inventory", () => {
  it("captures the real local historical schema read-only and compares deterministically", async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    try {
      const before = await captureSotInventory(prisma);
      const after = await captureSotInventory(prisma);
      expect(before.format).toBe("broco-sot-inventory-v1");
      expect(before.counts.Client).toBeGreaterThanOrEqual(0);
      expect(before.counts.Project).toBeGreaterThanOrEqual(0);
      expect(compareSotInventories(before, after)).toEqual([]);
    } finally {
      await prisma.$disconnect();
    }
  });
});
