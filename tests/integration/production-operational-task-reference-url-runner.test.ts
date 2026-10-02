import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertLocalTestDatabaseUrl } from "@/lib/test-db-guard";
import {
  getOperationalTaskReferenceUrlMigrationStatements,
  inspectOperationalTaskReferenceUrlMigration,
  runOperationalTaskReferenceUrlMigration,
} from "@/lib/production/operational-task-reference-url-migration";

const TEST_URL = assertLocalTestDatabaseUrl(process.env.DATABASE_URL_TEST);
let prisma: PrismaClient;
let schema: string;

function quote(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

describe("controlled reference URL migration for operational tasks", () => {
  beforeEach(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
    schema = `task_link_${randomUUID().replaceAll("-", "")}`;
    await prisma.$executeRawUnsafe(`CREATE SCHEMA ${quote(schema)}`);
    await prisma.$executeRawUnsafe(`CREATE TABLE ${quote(schema)}."operational_tasks" ("id" UUID PRIMARY KEY)`);
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);
    await prisma.$disconnect();
  });

  it("applies, validates and skips idempotently", async () => {
    expect((await inspectOperationalTaskReferenceUrlMigration(prisma, schema)).state).toBe("NOT_APPLIED");
    const first = await runOperationalTaskReferenceUrlMigration(prisma, { schema });
    expect(first).toEqual({ state: "APPLIED", executedStatements: getOperationalTaskReferenceUrlMigrationStatements().length });
    expect((await inspectOperationalTaskReferenceUrlMigration(prisma, schema)).state).toBe("COMPLETE");
    await expect(runOperationalTaskReferenceUrlMigration(prisma, { schema })).resolves.toEqual({ state: "SKIP", executedStatements: 0 });
  });

  it("aborts when the column already has an unexpected shape", async () => {
    await prisma.$executeRawUnsafe(`ALTER TABLE ${quote(schema)}."operational_tasks" ADD COLUMN "reference_url" VARCHAR(20) NOT NULL`);
    await expect(runOperationalTaskReferenceUrlMigration(prisma, { schema })).rejects.toThrow("Estado parcial");
  });
});
