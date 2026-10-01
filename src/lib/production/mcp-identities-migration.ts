import { Prisma, PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type SqlClient = PrismaClient | Prisma.TransactionClient;
const SCHEMA = "public";

function sqlPath() {
  return resolve(process.cwd(), "prisma/migrations/20261002090000_add_mcp_identities/migration.sql");
}

export function getMcpIdentitiesMigrationStatements() {
  const statements = readFileSync(sqlPath(), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  if (!statements.length) throw new Error("La migración MCP Identity no contiene DDL.");
  return statements;
}

async function query<T>(client: SqlClient, statement: string) {
  return client.$queryRawUnsafe<T[]>(statement);
}

export type McpIdentitiesMigrationInspection = {
  state: "NOT_APPLIED" | "COMPLETE" | "PARTIAL_ABORT" | "HISTORICAL_SCHEMA_MISSING_ABORT";
  problems: string[];
};

export async function inspectMcpIdentitiesMigration(
  client: SqlClient,
  schema = SCHEMA,
): Promise<McpIdentitiesMigrationInspection> {
  const safeSchema = schema.replaceAll("'", "''");
  const tables = await query<{ table_name: string }>(client, `SELECT table_name FROM information_schema.tables WHERE table_schema = '${safeSchema}' AND table_name IN ('app_users', 'mcp_identities')`);
  if (!tables.some((row) => row.table_name === "app_users")) return { state: "HISTORICAL_SCHEMA_MISSING_ABORT", problems: ["Falta tabla app_users."] };
  if (!tables.some((row) => row.table_name === "mcp_identities")) return { state: "NOT_APPLIED", problems: [] };

  const columns = await query<{ name: string; type: string; nullable: boolean }>(client, `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = '${safeSchema}' AND c.relname = 'mcp_identities' AND a.attnum > 0 AND NOT a.attisdropped`);
  const expected = new Map<string, [string, boolean]>([
    ["id", ["uuid", false]], ["provider", ["text", false]], ["subject", ["text", false]], ["app_user_id", ["uuid", false]], ["email_snapshot", ["text", true]], ["created_at", ["timestamp(3) without time zone", false]], ["updated_at", ["timestamp(3) without time zone", false]],
  ]);
  const actual = new Map(columns.map((column) => [column.name, column]));
  const problems: string[] = [];
  for (const column of columns) if (!expected.has(column.name)) problems.push(`Columna inesperada mcp_identities.${column.name}.`);
  for (const [name, [type, nullable]] of expected) {
    const column = actual.get(name);
    if (!column || column.type !== type || column.nullable !== nullable) problems.push(`Columna inesperada mcp_identities.${name}.`);
  }
  const indexes = await query<{ name: string; unique: boolean }>(client, `SELECT i.relname AS name, x.indisunique AS unique FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid JOIN pg_namespace n ON n.oid = i.relnamespace WHERE n.nspname = '${safeSchema}' AND i.relname LIKE 'mcp_identities_%'`);
  const indexMap = new Map(indexes.map((index) => [index.name, index.unique]));
  for (const [name, unique] of [["mcp_identities_pkey", true], ["mcp_identities_provider_subject_key", true], ["mcp_identities_app_user_id_key", true]] as const) if (indexMap.get(name) !== unique) problems.push(`Índice inesperado ${name}.`);
  const foreignKeys = await query<{ name: string; delete_type: string; table: string }>(client, `SELECT con.conname AS name, con.confdeltype AS delete_type, target.relname AS table FROM pg_constraint con JOIN pg_namespace n ON n.oid = con.connamespace JOIN pg_class target ON target.oid = con.confrelid WHERE n.nspname = '${safeSchema}' AND con.conname = 'mcp_identities_app_user_id_fkey'`);
  if (foreignKeys.length !== 1 || foreignKeys[0].delete_type !== "c" || foreignKeys[0].table !== "app_users") problems.push("FK inesperada mcp_identities_app_user_id_fkey.");
  return { state: problems.length ? "PARTIAL_ABORT" : "COMPLETE", problems };
}

export async function runMcpIdentitiesMigration(
  prisma: PrismaClient,
  options: { schema?: string; onEvent?: (event: string) => void; statements?: readonly string[] } = {},
) {
  const schema = options.schema ?? SCHEMA;
  if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) throw new Error("Schema de migración inválido.");
  const emit = options.onEvent ?? (() => undefined);
  const inspection = await inspectMcpIdentitiesMigration(prisma, schema);
  if (inspection.state === "COMPLETE") {
    emit("PRECHECK_COMPLETE"); emit("MIGRATION_SKIPPED");
    return { state: "SKIP" as const, executedStatements: 0 };
  }
  if (inspection.state !== "NOT_APPLIED") throw new Error(`Estado parcial de MCP Identity: ${inspection.problems.join(" ")}`);
  emit("PRECHECK_NOT_APPLIED");
  const statements = options.statements ?? getMcpIdentitiesMigrationStatements();
  await prisma.$transaction([
    prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('broco:mcp-identities-v1-migration'))"),
    prisma.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`),
    ...statements.map((statement) => prisma.$executeRawUnsafe(statement)),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  const postcheck = await inspectMcpIdentitiesMigration(prisma, schema);
  if (postcheck.state !== "COMPLETE") throw new Error(`POSTCHECK_ABORT: ${postcheck.problems.join(" ") || postcheck.state}`);
  emit("POSTCHECK_COMPLETE"); emit("MIGRATION_COMPLETED");
  return { state: "APPLIED" as const, executedStatements: statements.length };
}
