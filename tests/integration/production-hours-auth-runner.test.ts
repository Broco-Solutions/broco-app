import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertLocalTestDatabaseUrl } from "@/lib/test-db-guard";
import {
  getHoursAuthMigrationStatements,
  inspectHoursAuthMigration,
  runHoursAuthMigration,
} from "@/lib/production/hours-auth-migration";

const TEST_URL = assertLocalTestDatabaseUrl(process.env.DATABASE_URL_TEST);
let prisma: PrismaClient;
let schema: string;

function quote(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function createHistoricalSchema() {
  const tables = ["clients", "projects", "incomes", "expenses", "income_types", "expense_categories", "project_phases", "project_tasks", "project_share_links"];
  for (const table of tables) {
    await prisma.$executeRawUnsafe(`CREATE TABLE ${quote(schema)}.${quote(table)} (id UUID PRIMARY KEY)`);
  }
}

describe("controlled Auth/Tiempos production runner", () => {
  beforeEach(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
    schema = `prod_prep_${randomUUID().replaceAll("-", "")}`;
    await prisma.$executeRawUnsafe(`CREATE SCHEMA ${quote(schema)}`);
    await createHistoricalSchema();
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);
    await prisma.$disconnect();
  });

  it("applies from NOT_APPLIED, validates all artifacts, and skips safely on a second run", async () => {
    expect((await inspectHoursAuthMigration(prisma, schema)).state).toBe("NOT_APPLIED");
    const events: string[] = [];
    const first = await runHoursAuthMigration(prisma, { schema, onEvent: (event) => events.push(event) });
    expect(first.state).toBe("APPLIED");
    expect(first.executedStatements).toBe(getHoursAuthMigrationStatements().length);
    expect(events).toContain("PRECHECK_NOT_APPLIED");
    expect(events).toContain("POSTCHECK_COMPLETE");
    expect(events).toContain("MIGRATION_COMPLETED");
    expect((await inspectHoursAuthMigration(prisma, schema)).state).toBe("COMPLETE");

    const second = await runHoursAuthMigration(prisma, { schema });
    expect(second).toEqual({ state: "SKIP", executedStatements: 0 });
  });

  it("aborts a partial or structurally unexpected state before DDL", async () => {
    await prisma.$executeRawUnsafe(`CREATE TYPE ${quote(schema)}."AppUserRole" AS ENUM ('ADMIN')`);
    const inspection = await inspectHoursAuthMigration(prisma, schema);
    expect(inspection.state).toBe("PARTIAL_ABORT");
    await expect(runHoursAuthMigration(prisma, { schema })).rejects.toThrow("Estado parcial");
    expect((await inspectHoursAuthMigration(prisma, schema)).state).toBe("PARTIAL_ABORT");
  });

  it("aborts before DDL when the historical SOT schema is not present", async () => {
    const emptySchema = `prod_empty_${randomUUID().replaceAll("-", "")}`;
    await prisma.$executeRawUnsafe(`CREATE SCHEMA ${quote(emptySchema)}`);
    try {
      expect((await inspectHoursAuthMigration(prisma, emptySchema)).state).toBe("HISTORICAL_SCHEMA_MISSING_ABORT");
      await expect(runHoursAuthMigration(prisma, { schema: emptySchema })).rejects.toThrow("Faltan tablas históricas");
    } finally {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${quote(emptySchema)} CASCADE`);
    }
  });

  it("keeps the versioned statement order dependency-safe", () => {
    const statements = getHoursAuthMigrationStatements();
    expect(statements.every((statement) => !statement.includes(";"))).toBe(true);
    expect(statements[0]).toContain('CREATE TYPE "AppUserRole"');
    expect(statements.findIndex((statement) => statement.includes('CREATE TABLE "app_users"')))
      .toBeLessThan(statements.findIndex((statement) => statement.includes('ALTER TABLE "access_tokens"')));
    expect(statements.at(-1)).toContain('time_entry_audits_entry_id_created_at_idx');
  });

  it("matches the Auth/Tiempos schema already generated on the dedicated local DB", async () => {
    expect((await inspectHoursAuthMigration(prisma)).state).toBe("COMPLETE");
  });
});
