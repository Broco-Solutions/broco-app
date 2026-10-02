import { Prisma, PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type SqlClient = PrismaClient | Prisma.TransactionClient;

function assertSchemaName(schema: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) throw new Error("Schema de migración inválido.");
}

function quote(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function migrationPath() {
  return resolve(process.cwd(), "prisma/migrations/20261002160000_add_operational_task_reference_url/migration.sql");
}

export function getOperationalTaskReferenceUrlMigrationStatements() {
  const statements = readFileSync(migrationPath(), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  if (statements.length === 0) throw new Error("La migración de enlace de tarea no contiene DDL.");
  return statements;
}

async function query<T>(client: SqlClient, sql: string) {
  return client.$queryRawUnsafe<T[]>(sql);
}

export async function inspectOperationalTaskReferenceUrlMigration(client: SqlClient, schema = "public") {
  assertSchemaName(schema);
  const literal = `'${schema.replaceAll("'", "''")}'`;
  const tasks = await query<{ table_name: string }>(client, `
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = ${literal} AND table_name = 'operational_tasks'
  `);
  if (tasks.length !== 1) return { state: "HISTORICAL_SCHEMA_MISSING_ABORT" as const, problems: ["Falta tabla operational_tasks."] };

  const columns = await query<{ type_name: string; nullable: boolean }>(client, `
    SELECT format_type(a.atttypid, a.atttypmod) AS type_name, NOT a.attnotnull AS nullable
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${literal} AND c.relname = 'operational_tasks'
      AND a.attname = 'reference_url' AND a.attnum > 0 AND NOT a.attisdropped
  `);
  if (columns.length === 0) return { state: "NOT_APPLIED" as const, problems: [] as string[] };
  if (columns.length === 1 && columns[0].type_name === "text" && columns[0].nullable) {
    return { state: "COMPLETE" as const, problems: [] as string[] };
  }
  return { state: "PARTIAL_ABORT" as const, problems: ["Columna operational_tasks.reference_url inesperada."] };
}

export async function runOperationalTaskReferenceUrlMigration(
  prisma: PrismaClient,
  options: { schema?: string; statements?: readonly string[]; onEvent?: (event: string) => void } = {},
) {
  const schema = options.schema ?? "public";
  assertSchemaName(schema);
  const emit = options.onEvent ?? (() => undefined);
  const inspection = await inspectOperationalTaskReferenceUrlMigration(prisma, schema);
  if (inspection.state === "COMPLETE") {
    emit("PRECHECK_COMPLETE");
    emit("MIGRATION_SKIPPED");
    return { state: "SKIP" as const, executedStatements: 0 };
  }
  if (inspection.state === "PARTIAL_ABORT") throw new Error(`Estado parcial del enlace de tarea: ${inspection.problems.join(" ")}`);
  if (inspection.state === "HISTORICAL_SCHEMA_MISSING_ABORT") throw new Error(inspection.problems.join(" "));

  const statements = options.statements ?? getOperationalTaskReferenceUrlMigrationStatements();
  emit("PRECHECK_NOT_APPLIED");
  await prisma.$transaction([
    prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('broco:operational-task-reference-url-migration'))"),
    prisma.$executeRawUnsafe(`SET LOCAL search_path TO ${quote(schema)}`),
    ...statements.map((statement) => prisma.$executeRawUnsafe(statement)),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const postcheck = await inspectOperationalTaskReferenceUrlMigration(prisma, schema);
  if (postcheck.state !== "COMPLETE") throw new Error(`POSTCHECK_ABORT: ${postcheck.problems.join(" ")}`);
  emit("POSTCHECK_COMPLETE");
  emit("MIGRATION_COMPLETED");
  return { state: "APPLIED" as const, executedStatements: statements.length };
}
