import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertLocalTestDatabaseUrl } from "@/lib/test-db-guard";
import {
  getOperationalTaskTimeMigrationStatements,
  inspectOperationalTaskTimeMigration,
  runOperationalTaskTimeMigration,
} from "@/lib/production/operational-task-time-migration";

const TEST_URL = assertLocalTestDatabaseUrl(process.env.DATABASE_URL_TEST);
let prisma: PrismaClient;
let schema: string;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

describe("controlled vínculo Tareas/Tiempos production runner", () => {
  beforeEach(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
    schema = `task_time_${randomUUID().replaceAll("-", "")}`;
    await prisma.$executeRawUnsafe(`CREATE SCHEMA ${quote(schema)}`);
    await prisma.$executeRawUnsafe(`CREATE TABLE ${quote(schema)}."operational_tasks" ("id" UUID PRIMARY KEY)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE ${quote(schema)}."time_entries" ("id" UUID PRIMARY KEY, "status" TEXT NOT NULL)`);
  });
  afterEach(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);
    await prisma.$disconnect();
  });

  it("aplica y salta de forma idempotente", async () => {
    expect((await inspectOperationalTaskTimeMigration(prisma, schema)).state).toBe("NOT_APPLIED");
    expect((await runOperationalTaskTimeMigration(prisma, { schema })).state).toBe("APPLIED");
    expect((await inspectOperationalTaskTimeMigration(prisma, schema)).state).toBe("COMPLETE");
    expect(await runOperationalTaskTimeMigration(prisma, { schema })).toEqual({ state: "SKIP", executedStatements: 0 });
  });

  it("mantiene tres sentencias unitarias y ordenadas", () => {
    const statements = getOperationalTaskTimeMigrationStatements();
    expect(statements).toHaveLength(3);
    expect(statements.every((statement) => !statement.includes(";"))).toBe(true);
    expect(statements[0]).toContain("ADD COLUMN");
    expect(statements.at(-1)).toContain("time_entries_operational_task_id_fkey");
  });
});
