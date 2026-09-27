import { describe, expect, it } from "vitest";
import {
  assertProductionDirectUrl,
  resolveBootstrapTarget,
  resolveInventoryTarget,
  resolveLocalTestTarget,
  resolveProductionTarget,
} from "@/lib/production/target";

const LOCAL_TEST = "postgresql://broco_test:broco_test@localhost:5434/broco_finance_test";
const DIRECT = "postgresql://operator:placeholder@db.prisma.io:5432/postgres?sslmode=require";
const POOLED = "postgresql://operator:placeholder@pooled.db.prisma.io:5432/postgres?sslmode=require";
const LEGACY_ACCELERATE = "prisma+postgres://db.prisma.io/?api_key=not-a-real-secret";

describe("production target guards", () => {
  it("requires an explicit production DDL guard", () => {
    expect(() => resolveProductionTarget({ DIRECT_URL: DIRECT })).toThrow("ALLOW_PRODUCTION_MIGRATION");
  });

  it("accepts only the direct Prisma Postgres URL", () => {
    expect(assertProductionDirectUrl(DIRECT)).toBe(DIRECT);
  });

  it.each([
    [POOLED, "host"],
    [LOCAL_TEST, "host"],
    [LEGACY_ACCELERATE, "PostgreSQL"],
    ["postgresql://x:x@db.prisma.io:5433/postgres?sslmode=require", "puerto"],
    ["postgresql://x:x@db.prisma.io:5432/other?sslmode=require", "base postgres"],
    ["postgresql://x:x@db.prisma.io:5432/postgres", "sslmode=require"],
    ["postgresql://x:x@db.prisma.io:5432/postgres?sslmode=disable", "sslmode=require"],
    ["postgresql://x:x@db.prisma.io:5432/postgres?sslmode=require&connect_timeout=5", "parámetros"],
  ])("rechaza un destino directo inválido: %s", (url, message) => {
    expect(() => assertProductionDirectUrl(url)).toThrow(message);
  });

  it("uses DIRECT_URL and never DATABASE_URL for administrative targets", () => {
    expect(resolveProductionTarget({
      DATABASE_URL: POOLED,
      DIRECT_URL: DIRECT,
      ALLOW_PRODUCTION_MIGRATION: "true",
    })).toEqual({ directUrl: DIRECT, mode: "production" });
    expect(resolveInventoryTarget({
      DATABASE_URL: LOCAL_TEST,
      DIRECT_URL: DIRECT,
      ALLOW_PRODUCTION_INVENTORY: "true",
    })).toEqual({ directUrl: DIRECT, mode: "production" });
  });

  it("rejects a correct runtime DATABASE_URL when DIRECT_URL is absent", () => {
    expect(() => resolveProductionTarget({ DATABASE_URL: POOLED, ALLOW_PRODUCTION_MIGRATION: "true" })).toThrow("DIRECT_URL");
    expect(() => resolveInventoryTarget({ DATABASE_URL: POOLED, ALLOW_PRODUCTION_INVENTORY: "true" })).toThrow("DIRECT_URL");
  });

  it("allows the local runner only with both test guards and the exact DB", () => {
    expect(() => resolveLocalTestTarget({ NODE_ENV: "test", DATABASE_URL_TEST: LOCAL_TEST })).toThrow("ALLOW_LOCAL_MIGRATION_TEST");
    expect(resolveLocalTestTarget({ NODE_ENV: "test", ALLOW_LOCAL_MIGRATION_TEST: "true", DATABASE_URL_TEST: LOCAL_TEST }).mode).toBe("local-test");
    expect(() => resolveLocalTestTarget({ NODE_ENV: "test", ALLOW_LOCAL_MIGRATION_TEST: "true", DATABASE_URL_TEST: "postgresql://x:x@localhost:5435/other" })).toThrow("puerto 5434");
  });

  it("makes bootstrap a separately guarded write target", () => {
    expect(() => resolveBootstrapTarget({ DIRECT_URL: DIRECT })).toThrow("ALLOW_ADMIN_BOOTSTRAP");
    expect(() => resolveBootstrapTarget({ NODE_ENV: "test", ALLOW_ADMIN_BOOTSTRAP: "true", DATABASE_URL_TEST: LOCAL_TEST })).toThrow("ALLOW_LOCAL_BOOTSTRAP_TEST");
    expect(resolveBootstrapTarget({ NODE_ENV: "test", ALLOW_ADMIN_BOOTSTRAP: "true", ALLOW_LOCAL_BOOTSTRAP_TEST: "true", DATABASE_URL_TEST: LOCAL_TEST }).mode).toBe("local-test");
    expect(resolveBootstrapTarget({ NODE_ENV: "production", ALLOW_ADMIN_BOOTSTRAP: "true", DIRECT_URL: DIRECT, DATABASE_URL: POOLED }).directUrl).toBe(DIRECT);
  });
});
