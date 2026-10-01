import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertLocalTestDatabaseUrl } from "@/lib/test-db-guard";
import {
  getOperationalTasksMigrationStatements,
  inspectOperationalTasksMigration,
  runOperationalTasksMigration,
} from "@/lib/production/operational-tasks-migration";

const TEST_URL = assertLocalTestDatabaseUrl(process.env.DATABASE_URL_TEST);
let prisma: PrismaClient;
let schema: string;

function quote(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

describe("controlled Tareas Operativas production runner", () => {
  beforeEach(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
    schema = `tasks_prep_${randomUUID().replaceAll("-", "")}`;
    await prisma.$executeRawUnsafe(`CREATE SCHEMA ${quote(schema)}`);
    await prisma.$executeRawUnsafe(`CREATE TABLE ${quote(schema)}."projects" ("id" UUID PRIMARY KEY)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE ${quote(schema)}."app_users" ("id" UUID PRIMARY KEY)`);
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);
    await prisma.$disconnect();
  });

  it("aplica, valida y salta de forma idempotente", async () => {
    expect((await inspectOperationalTasksMigration(prisma, schema)).state).toBe("NOT_APPLIED");
    const first = await runOperationalTasksMigration(prisma, { schema });
    expect(first).toEqual({ state: "APPLIED", executedStatements: getOperationalTasksMigrationStatements().length });
    expect((await inspectOperationalTasksMigration(prisma, schema)).state).toBe("COMPLETE");
    expect(await runOperationalTasksMigration(prisma, { schema })).toEqual({ state: "SKIP", executedStatements: 0 });
  });

  it("aborta ante estado parcial y revierte un lote fallido", async () => {
    await prisma.$executeRawUnsafe(`CREATE TYPE ${quote(schema)}."OperationalTaskStatus" AS ENUM ('PENDING')`);
    expect((await inspectOperationalTasksMigration(prisma, schema)).state).toBe("PARTIAL_ABORT");
    await expect(runOperationalTasksMigration(prisma, { schema })).rejects.toThrow("Estado parcial");
  });

  it("mantiene DDL unitario y ordenado por dependencias", () => {
    const statements = getOperationalTasksMigrationStatements();
    expect(statements.every((statement) => !statement.includes(";"))).toBe(true);
    expect(statements[0]).toContain('CREATE TYPE "OperationalTaskStatus"');
    expect(statements[1]).toContain('CREATE TABLE "operational_tasks"');
    expect(statements.at(-1)).toContain("operational_tasks_project_id_fkey");
  });
});
