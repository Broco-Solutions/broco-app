import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertLocalTestDatabaseUrl } from "@/lib/test-db-guard";
import {
  getMcpIdentitiesMigrationStatements,
  inspectMcpIdentitiesMigration,
  runMcpIdentitiesMigration,
} from "@/lib/production/mcp-identities-migration";

const TEST_URL = assertLocalTestDatabaseUrl(process.env.DATABASE_URL_TEST);
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
let prisma: PrismaClient;
let schema: string;

describe("controlled MCP identity production runner", () => {
  beforeEach(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
    schema = `mcp_identity_${randomUUID().replaceAll("-", "")}`;
    await prisma.$executeRawUnsafe(`CREATE SCHEMA ${quote(schema)}`);
    await prisma.$executeRawUnsafe(`CREATE TABLE ${quote(schema)}."app_users" ("id" UUID PRIMARY KEY)`);
  });
  afterEach(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);
    await prisma.$disconnect();
  });

  it("aplica, valida y salta de forma idempotente", async () => {
    expect((await inspectMcpIdentitiesMigration(prisma, schema)).state).toBe("NOT_APPLIED");
    expect((await runMcpIdentitiesMigration(prisma, { schema })).state).toBe("APPLIED");
    expect((await inspectMcpIdentitiesMigration(prisma, schema)).state).toBe("COMPLETE");
    expect(await runMcpIdentitiesMigration(prisma, { schema })).toEqual({ state: "SKIP", executedStatements: 0 });
  });

  it("aborta ante una tabla parcial y conserva DDL unitario", async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE ${quote(schema)}."mcp_identities" ("id" UUID PRIMARY KEY)`);
    expect((await inspectMcpIdentitiesMigration(prisma, schema)).state).toBe("PARTIAL_ABORT");
    await expect(runMcpIdentitiesMigration(prisma, { schema })).rejects.toThrow("Estado parcial");
    expect(getMcpIdentitiesMigrationStatements().every((statement) => !statement.includes(";"))).toBe(true);
  });
});
