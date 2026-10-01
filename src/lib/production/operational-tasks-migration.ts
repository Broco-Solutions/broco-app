import { Prisma, PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type SqlClient = PrismaClient | Prisma.TransactionClient;

export const OPERATIONAL_TASKS_SCHEMA = "public";

export type OperationalTasksMigrationState =
  | "NOT_APPLIED"
  | "COMPLETE"
  | "PARTIAL_ABORT"
  | "HISTORICAL_SCHEMA_MISSING_ABORT";

export type OperationalTasksMigrationInspection = {
  state: OperationalTasksMigrationState;
  missingHistoricalTables: string[];
  problems: string[];
};

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function assertSchemaName(schema: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) throw new Error("Schema de migración inválido.");
}

function migrationSqlPath() {
  return resolve(process.cwd(), "prisma/migrations/20261001090000_add_operational_tasks/migration.sql");
}

export function getOperationalTasksMigrationStatements(): string[] {
  const source = readFileSync(migrationSqlPath(), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  const statements = source.split(";").map((statement) => statement.trim()).filter(Boolean);
  if (statements.length === 0) throw new Error("La migración de Tareas no contiene DDL.");
  return statements;
}

async function query<T>(client: SqlClient, sql: string): Promise<T[]> {
  return client.$queryRawUnsafe<T[]>(sql);
}

export async function inspectOperationalTasksMigration(
  client: SqlClient,
  schema = OPERATIONAL_TASKS_SCHEMA,
): Promise<OperationalTasksMigrationInspection> {
  assertSchemaName(schema);
  const schemaLiteral = `'${schema.replaceAll("'", "''")}'`;
  const historical = await query<{ table_name: string }>(client, `
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = ${schemaLiteral} AND table_name IN ('projects', 'app_users')
  `);
  const foundHistorical = new Set(historical.map((row) => row.table_name));
  const missingHistoricalTables = ["projects", "app_users"].filter((table) => !foundHistorical.has(table));
  if (missingHistoricalTables.length > 0) {
    return { state: "HISTORICAL_SCHEMA_MISSING_ABORT", missingHistoricalTables, problems: [] };
  }

  const tables = await query<{ table_name: string }>(client, `
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = ${schemaLiteral} AND table_name = 'operational_tasks'
  `);
  const enums = await query<{ label: string }>(client, `
    SELECT e.enumlabel AS label
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE n.nspname = ${schemaLiteral} AND t.typname = 'OperationalTaskStatus'
    ORDER BY e.enumsortorder
  `);
  const anyArtifact = tables.length > 0 || enums.length > 0;
  if (!anyArtifact) return { state: "NOT_APPLIED", missingHistoricalTables: [], problems: [] };

  const problems: string[] = [];
  if (tables.length !== 1) problems.push("Falta tabla operational_tasks.");
  if (enums.map((row) => row.label).join(",") !== "PENDING,IN_PROGRESS,BLOCKED,DONE") {
    problems.push("Enum OperationalTaskStatus inesperado.");
  }

  const expectedColumns = new Map<string, [string, boolean]>([
    ["id", ["uuid", false]], ["title", ["text", false]], ["description", ["text", true]],
    ["status", [`${schema === "public" ? "" : `${schema}.`}"OperationalTaskStatus"`, false]],
    ["creator_id", ["uuid", false]], ["assignee_id", ["uuid", false]], ["project_id", ["uuid", true]],
    ["due_date", ["date", true]], ["blocked_reason", ["text", true]], ["completed_at", ["timestamp(3) without time zone", true]],
    ["created_at", ["timestamp(3) without time zone", false]], ["updated_at", ["timestamp(3) without time zone", false]],
  ]);
  const columns = await query<{ column_name: string; type_name: string; nullable: boolean }>(client, `
    SELECT a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS type_name, NOT a.attnotnull AS nullable
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${schemaLiteral} AND c.relname = 'operational_tasks' AND a.attnum > 0 AND NOT a.attisdropped
  `);
  const actualColumns = new Map(columns.map((row) => [row.column_name, row]));
  for (const row of columns) if (!expectedColumns.has(row.column_name)) problems.push(`Columna inesperada operational_tasks.${row.column_name}.`);
  for (const [name, [type, nullable]] of expectedColumns) {
    const actual = actualColumns.get(name);
    const typeMatches = name === "status"
      ? actual?.type_name.endsWith('"OperationalTaskStatus"')
      : actual?.type_name === type;
    if (!actual || !typeMatches || actual.nullable !== nullable) problems.push(`Columna inesperada operational_tasks.${name}.`);
  }

  const expectedIndexes = new Map<string, boolean>([
    ["operational_tasks_pkey", true],
    ["operational_tasks_assignee_id_status_due_date_idx", false],
    ["operational_tasks_project_id_status_idx", false],
    ["operational_tasks_status_due_date_idx", false],
    ["operational_tasks_updated_at_idx", false],
  ]);
  const indexes = await query<{ index_name: string; is_unique: boolean }>(client, `
    SELECT i.relname AS index_name, x.indisunique AS is_unique
    FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid JOIN pg_namespace n ON n.oid = i.relnamespace
    WHERE n.nspname = ${schemaLiteral} AND i.relname LIKE 'operational_tasks_%'
  `);
  const actualIndexes = new Map(indexes.map((row) => [row.index_name, row.is_unique]));
  for (const [name, unique] of expectedIndexes) if (actualIndexes.get(name) !== unique) problems.push(`Índice inesperado ${name}.`);

  const expectedFks = new Map<string, [string, string]>([
    ["operational_tasks_creator_id_fkey", ["r", "app_users"]],
    ["operational_tasks_assignee_id_fkey", ["r", "app_users"]],
    ["operational_tasks_project_id_fkey", ["n", "projects"]],
  ]);
  const foreignKeys = await query<{ constraint_name: string; delete_type: string; referenced_table: string }>(client, `
    SELECT con.conname AS constraint_name, con.confdeltype AS delete_type, target.relname AS referenced_table
    FROM pg_constraint con JOIN pg_namespace n ON n.oid = con.connamespace JOIN pg_class target ON target.oid = con.confrelid
    WHERE n.nspname = ${schemaLiteral} AND con.contype = 'f' AND con.conname LIKE 'operational_tasks_%'
  `);
  const actualFks = new Map(foreignKeys.map((row) => [row.constraint_name, row]));
  for (const [name, [deleteType, table]] of expectedFks) {
    const actual = actualFks.get(name);
    if (!actual || actual.delete_type !== deleteType || actual.referenced_table !== table) problems.push(`FK inesperada ${name}.`);
  }

  return { state: problems.length === 0 ? "COMPLETE" : "PARTIAL_ABORT", missingHistoricalTables: [], problems };
}

export async function runOperationalTasksMigration(
  prisma: PrismaClient,
  options: { schema?: string; onEvent?: (event: string) => void; statements?: readonly string[] } = {},
) {
  const schema = options.schema ?? OPERATIONAL_TASKS_SCHEMA;
  assertSchemaName(schema);
  const emit = options.onEvent ?? (() => undefined);
  const inspection = await inspectOperationalTasksMigration(prisma, schema);
  if (inspection.state === "COMPLETE") {
    emit("PRECHECK_COMPLETE"); emit("MIGRATION_SKIPPED");
    return { state: "SKIP" as const, executedStatements: 0 };
  }
  if (inspection.state === "PARTIAL_ABORT") throw new Error(`Estado parcial de Tareas: ${inspection.problems.join(" ")}`);
  if (inspection.state === "HISTORICAL_SCHEMA_MISSING_ABORT") throw new Error(`Faltan tablas históricas: ${inspection.missingHistoricalTables.join(", ")}`);

  emit("PRECHECK_NOT_APPLIED");
  const statements = options.statements ?? getOperationalTasksMigrationStatements();
  await prisma.$transaction([
    prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('broco:operational-tasks-v1-migration'))"),
    prisma.$executeRawUnsafe(`SET LOCAL search_path TO ${quoteIdentifier(schema)}`),
    ...statements.map((statement) => prisma.$executeRawUnsafe(statement)),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const postcheck = await inspectOperationalTasksMigration(prisma, schema);
  if (postcheck.state !== "COMPLETE") throw new Error(`POSTCHECK_ABORT: ${postcheck.problems.join(" ") || postcheck.state}`);
  emit("POSTCHECK_COMPLETE"); emit("MIGRATION_COMPLETED");
  return { state: "APPLIED" as const, executedStatements: statements.length };
}
