import { Prisma, PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type SqlClient = PrismaClient | Prisma.TransactionClient;

function assertSchemaName(schema: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) throw new Error("Schema de migración inválido.");
}
function quote(identifier: string) { return `"${identifier.replaceAll('"', '""')}"`; }
function path() { return resolve(process.cwd(), "prisma/migrations/20261001130000_link_operational_tasks_time_entries/migration.sql"); }

export function getOperationalTaskTimeMigrationStatements() {
  return readFileSync(path(), "utf8").split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n")
    .split(";").map((statement) => statement.trim()).filter(Boolean);
}

async function query<T>(client: SqlClient, sql: string) { return client.$queryRawUnsafe<T[]>(sql); }

export async function inspectOperationalTaskTimeMigration(client: SqlClient, schema = "public") {
  assertSchemaName(schema);
  const literal = `'${schema.replaceAll("'", "''")}'`;
  const tables = await query<{ table_name: string }>(client, `SELECT table_name FROM information_schema.tables WHERE table_schema=${literal} AND table_name IN ('operational_tasks','time_entries')`);
  const found = new Set(tables.map((row) => row.table_name));
  const missing = ["operational_tasks", "time_entries"].filter((table) => !found.has(table));
  if (missing.length) return { state: "HISTORICAL_SCHEMA_MISSING_ABORT" as const, problems: missing };
  const columns = await query<{ column_name: string; type_name: string; nullable: boolean }>(client, `SELECT a.attname AS column_name, format_type(a.atttypid,a.atttypmod) AS type_name, NOT a.attnotnull AS nullable FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${literal} AND c.relname='time_entries' AND a.attname='operational_task_id' AND a.attnum>0 AND NOT a.attisdropped`);
  const indexes = await query<{ name: string }>(client, `SELECT indexname AS name FROM pg_indexes WHERE schemaname=${literal} AND indexname='time_entries_operational_task_id_status_idx'`);
  const fks = await query<{ name: string; delete_type: string; table_name: string }>(client, `SELECT con.conname AS name, con.confdeltype AS delete_type, target.relname AS table_name FROM pg_constraint con JOIN pg_namespace n ON n.oid=con.connamespace JOIN pg_class target ON target.oid=con.confrelid WHERE n.nspname=${literal} AND con.conname='time_entries_operational_task_id_fkey'`);
  const any = columns.length || indexes.length || fks.length;
  if (!any) return { state: "NOT_APPLIED" as const, problems: [] as string[] };
  const problems: string[] = [];
  if (columns.length !== 1 || columns[0].type_name !== "uuid" || !columns[0].nullable) problems.push("Columna time_entries.operational_task_id inesperada.");
  if (indexes.length !== 1) problems.push("Falta índice de tarea/estado.");
  if (fks.length !== 1 || fks[0].delete_type !== "n" || fks[0].table_name !== "operational_tasks") problems.push("FK de tiempo/tarea inesperada.");
  return { state: problems.length ? "PARTIAL_ABORT" as const : "COMPLETE" as const, problems };
}

export async function runOperationalTaskTimeMigration(prisma: PrismaClient, options: { schema?: string; statements?: readonly string[]; onEvent?: (event: string) => void } = {}) {
  const schema = options.schema ?? "public";
  assertSchemaName(schema);
  const emit = options.onEvent ?? (() => undefined);
  const inspection = await inspectOperationalTaskTimeMigration(prisma, schema);
  if (inspection.state === "COMPLETE") { emit("PRECHECK_COMPLETE"); emit("MIGRATION_SKIPPED"); return { state: "SKIP" as const, executedStatements: 0 }; }
  if (inspection.state === "PARTIAL_ABORT") throw new Error(`Estado parcial del vínculo Tareas/Tiempos: ${inspection.problems.join(" ")}`);
  if (inspection.state === "HISTORICAL_SCHEMA_MISSING_ABORT") throw new Error(`Faltan tablas históricas: ${inspection.problems.join(", ")}`);
  const statements = options.statements ?? getOperationalTaskTimeMigrationStatements();
  emit("PRECHECK_NOT_APPLIED");
  await prisma.$transaction([
    prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('broco:operational-task-time-v1-migration'))"),
    prisma.$executeRawUnsafe(`SET LOCAL search_path TO ${quote(schema)}`),
    ...statements.map((statement) => prisma.$executeRawUnsafe(statement)),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  const postcheck = await inspectOperationalTaskTimeMigration(prisma, schema);
  if (postcheck.state !== "COMPLETE") throw new Error(`POSTCHECK_ABORT: ${postcheck.problems.join(" ")}`);
  emit("POSTCHECK_COMPLETE"); emit("MIGRATION_COMPLETED");
  return { state: "APPLIED" as const, executedStatements: statements.length };
}
