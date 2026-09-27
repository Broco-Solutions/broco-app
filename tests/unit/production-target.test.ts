import { describe, expect, it } from "vitest";
import {
  assertProductionAccelerateUrl,
  resolveInventoryTarget,
  resolveBootstrapTarget,
  resolveLocalTestTarget,
  resolveProductionTarget,
} from "@/lib/production/target";

const LOCAL_TEST = "postgresql://broco_test:broco_test@localhost:5434/broco_finance_test";
const ACCELERATE = "prisma+postgres://db.prisma.io/?api_key=not-a-real-secret";

describe("production target guards", () => {
  it("requires an explicit production DDL guard", () => {
    expect(() => resolveProductionTarget({ DATABASE_URL: ACCELERATE })).toThrow("ALLOW_PRODUCTION_MIGRATION");
  });

  it("rejects local, regular PostgreSQL, and unexpected Accelerate endpoints for production", () => {
    expect(() => assertProductionAccelerateUrl(LOCAL_TEST)).toThrow("prisma+postgres");
    expect(() => assertProductionAccelerateUrl("prisma+postgres://evil.example/?api_key=x")).toThrow("db.prisma.io");
  });

  it("allows only the documented Accelerate target after the deliberate guard", () => {
    expect(resolveProductionTarget({ DATABASE_URL: ACCELERATE, ALLOW_PRODUCTION_MIGRATION: "true" }).mode).toBe("production");
    expect(resolveInventoryTarget({ DATABASE_URL: ACCELERATE, ALLOW_PRODUCTION_INVENTORY: "true" }).mode).toBe("production");
  });

  it("allows the local runner only with both test guards and the exact DB", () => {
    expect(() => resolveLocalTestTarget({ NODE_ENV: "test", DATABASE_URL_TEST: LOCAL_TEST })).toThrow("ALLOW_LOCAL_MIGRATION_TEST");
    expect(resolveLocalTestTarget({ NODE_ENV: "test", ALLOW_LOCAL_MIGRATION_TEST: "true", DATABASE_URL_TEST: LOCAL_TEST }).mode).toBe("local-test");
    expect(() => resolveLocalTestTarget({ NODE_ENV: "test", ALLOW_LOCAL_MIGRATION_TEST: "true", DATABASE_URL_TEST: "postgresql://x:x@localhost:5435/other" })).toThrow("puerto 5434");
  });

  it("makes bootstrap a separately guarded write target", () => {
    expect(() => resolveBootstrapTarget({ DATABASE_URL: ACCELERATE })).toThrow("ALLOW_ADMIN_BOOTSTRAP");
    expect(() => resolveBootstrapTarget({ NODE_ENV: "test", ALLOW_ADMIN_BOOTSTRAP: "true", DATABASE_URL_TEST: LOCAL_TEST })).toThrow("ALLOW_LOCAL_BOOTSTRAP_TEST");
    expect(resolveBootstrapTarget({ NODE_ENV: "test", ALLOW_ADMIN_BOOTSTRAP: "true", ALLOW_LOCAL_BOOTSTRAP_TEST: "true", DATABASE_URL_TEST: LOCAL_TEST }).mode).toBe("local-test");
  });
});
