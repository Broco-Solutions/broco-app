import { Prisma, PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type SqlClient = PrismaClient | Prisma.TransactionClient;

export const HOURS_AUTH_SCHEMA = "public";

const HISTORICAL_TABLES = [
  "clients",
  "projects",
  "incomes",
  "expenses",
  "income_types",
  "expense_categories",
  "project_phases",
  "project_tasks",
  "project_share_links",
] as const;

const NEW_TABLES = [
  "app_users",
  "access_tokens",
  "hour_assignments",
  "time_entries",
  "time_entry_audits",
] as const;

const EXPECTED_COLUMNS: Record<(typeof NEW_TABLES)[number], ReadonlyArray<readonly [string, string, boolean]>> = {
  app_users: [
    ["id", "uuid", false], ["name", "text", false], ["email", "text", false], ["password_hash", "text", false],
    ["role", '"AppUserRole"', false], ["is_active", "boolean", false], ["session_version", "integer", false],
    ["created_at", "timestamp(3) without time zone", false], ["updated_at", "timestamp(3) without time zone", false],
  ],
  access_tokens: [
    ["id", "uuid", false], ["user_id", "uuid", false], ["token_hash", "text", false], ["purpose", "text", false],
    ["expires_at", "timestamp(3) without time zone", false], ["used_at", "timestamp(3) without time zone", true],
    ["revoked_at", "timestamp(3) without time zone", true], ["created_at", "timestamp(3) without time zone", false],
  ],
  hour_assignments: [
    ["id", "uuid", false], ["user_id", "uuid", false], ["project_id", "uuid", false],
    ["created_at", "timestamp(3) without time zone", false],
  ],
  time_entries: [
    ["id", "uuid", false], ["user_id", "uuid", false], ["project_id", "uuid", false], ["work_date", "date", false],
    ["minutes", "integer", false], ["description", "text", false], ["reference_url", "text", true], ["status", "text", false],
    ["created_by_id", "uuid", false], ["modified_by_id", "uuid", true], ["void_reason", "text", true],
    ["idempotency_key", "text", true], ["created_at", "timestamp(3) without time zone", false],
    ["updated_at", "timestamp(3) without time zone", false],
  ],
  time_entry_audits: [
    ["id", "uuid", false], ["entry_id", "uuid", false], ["actor_id", "uuid", false], ["action", "text", false],
    ["reason", "text", true], ["before_json", "jsonb", true], ["after_json", "jsonb", true],
    ["created_at", "timestamp(3) without time zone", false],
  ],
};

const EXPECTED_INDEXES: Record<string, boolean> = {
  app_users_pkey: true,
  app_users_email_key: true,
  app_users_role_is_active_idx: false,
  access_tokens_pkey: true,
  access_tokens_token_hash_key: true,
  access_tokens_user_id_purpose_expires_at_idx: false,
  hour_assignments_pkey: true,
  hour_assignments_user_id_project_id_key: true,
  hour_assignments_project_id_idx: false,
  time_entries_pkey: true,
  time_entries_user_id_work_date_status_idx: false,
  time_entries_project_id_work_date_status_idx: false,
  time_entries_idempotency_key_key: true,
  time_entry_audits_pkey: true,
  time_entry_audits_entry_id_created_at_idx: false,
};

const EXPECTED_FOREIGN_KEYS: Record<string, readonly ["c" | "r", string]> = {
  access_tokens_user_id_fkey: ["c", "app_users"],
  hour_assignments_user_id_fkey: ["c", "app_users"],
  hour_assignments_project_id_fkey: ["c", "projects"],
  time_entries_user_id_fkey: ["r", "app_users"],
  time_entries_project_id_fkey: ["r", "projects"],
  time_entries_created_by_id_fkey: ["r", "app_users"],
  time_entries_modified_by_id_fkey: ["r", "app_users"],
  time_entry_audits_entry_id_fkey: ["c", "time_entries"],
  time_entry_audits_actor_id_fkey: ["r", "app_users"],
};

export type MigrationState =
  | "NOT_APPLIED"
  | "COMPLETE"
  | "PARTIAL_ABORT"
  | "HISTORICAL_SCHEMA_MISSING_ABORT";

export type MigrationInspection = {
  state: MigrationState;
  missingHistoricalTables: string[];
  problems: string[];
};

export type MigrationRunResult = {
  state: "APPLIED" | "SKIP";
  executedStatements: number;
};

function assertSchemaName(schema: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) throw new Error("Schema de migración inválido.");
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function literalList(values: readonly string[]) {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ");
}

async function query<T>(client: SqlClient, sql: string): Promise<T[]> {
  return client.$queryRawUnsafe<T[]>(sql);
}

function migrationSqlPath() {
  return resolve(process.cwd(), "prisma/migrations/20260927090000_add_hours_auth/migration.sql");
}

/** The versioned Prisma migration remains the single DDL source. */
export function getHoursAuthMigrationStatements(): string[] {
  const source = readFileSync(migrationSqlPath(), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  const statements = source.split(";").map((statement) => statement.trim()).filter(Boolean);
  if (statements.length === 0) throw new Error("La migración versionada no contiene sentencias DDL.");
  return statements;
}

function ddlLabel(statement: string, position: number) {
  const match = statement.replace(/\s+/g, " ").match(/^(CREATE TYPE|CREATE TABLE|CREATE UNIQUE INDEX|CREATE INDEX|ALTER TABLE) ([^ ]+)/i);
  return `DDL_${position}_${match ? `${match[1]} ${match[2]}` : "statement"}`;
}

function columnTypeMatches(expected: string, actual: string) {
  // PostgreSQL qualifies a user-defined enum outside `public`; in production
  // it is rendered as "AppUserRole", while the isolated runner test renders
  // <schema>."AppUserRole".
  return expected === '"AppUserRole"'
    ? actual === expected || actual.endsWith(`.${expected}`)
    : actual === expected;
}

export async function inspectHoursAuthMigration(client: SqlClient, schema = HOURS_AUTH_SCHEMA): Promise<MigrationInspection> {
  assertSchemaName(schema);
  const schemaLiteral = `'${schema.replaceAll("'", "''")}'`;

  const historicalRows = await query<{ table_name: string }>(client, `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = ${schemaLiteral}
      AND table_name IN (${literalList(HISTORICAL_TABLES)})
  `);
  const historicalFound = new Set(historicalRows.map((row) => row.table_name));
  const missingHistoricalTables = HISTORICAL_TABLES.filter((table) => !historicalFound.has(table));
  if (missingHistoricalTables.length > 0) {
    return { state: "HISTORICAL_SCHEMA_MISSING_ABORT", missingHistoricalTables, problems: [] };
  }

  const tableRows = await query<{ table_name: string }>(client, `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = ${schemaLiteral}
      AND table_name IN (${literalList(NEW_TABLES)})
  `);
  const tablesFound = new Set(tableRows.map((row) => row.table_name));
  const enumRows = await query<{ label: string }>(client, `
    SELECT e.enumlabel AS label
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE n.nspname = ${schemaLiteral} AND t.typname = 'AppUserRole'
    ORDER BY e.enumsortorder
  `);
  const indexRows = await query<{ index_name: string; is_unique: boolean }>(client, `
    SELECT i.relname AS index_name, x.indisunique AS is_unique
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_namespace n ON n.oid = i.relnamespace
    WHERE n.nspname = ${schemaLiteral}
      AND i.relname IN (${literalList(Object.keys(EXPECTED_INDEXES))})
  `);
  const foreignKeyRows = await query<{ constraint_name: string; delete_type: string; update_type: string; referenced_table: string }>(client, `
    SELECT con.conname AS constraint_name, con.confdeltype AS delete_type, con.confupdtype AS update_type,
      target.relname AS referenced_table
    FROM pg_constraint con
    JOIN pg_namespace n ON n.oid = con.connamespace
    JOIN pg_class target ON target.oid = con.confrelid
    WHERE n.nspname = ${schemaLiteral}
      AND con.contype = 'f'
      AND con.conname IN (${literalList(Object.keys(EXPECTED_FOREIGN_KEYS))})
  `);

  const anyNewArtifact = tablesFound.size > 0 || enumRows.length > 0 || indexRows.length > 0 || foreignKeyRows.length > 0;
  if (!anyNewArtifact) return { state: "NOT_APPLIED", missingHistoricalTables: [], problems: [] };

  const problems: string[] = [];
  for (const table of NEW_TABLES) if (!tablesFound.has(table)) problems.push(`Falta tabla ${table}.`);
  if (enumRows.map((row) => row.label).join(",") !== "ADMIN,COLLABORATOR") problems.push("Enum AppUserRole inesperado.");

  const columnRows = await query<{ table_name: string; column_name: string; type_name: string; nullable: boolean }>(client, `
    SELECT c.relname AS table_name, a.attname AS column_name,
      format_type(a.atttypid, a.atttypmod) AS type_name, NOT a.attnotnull AS nullable
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${schemaLiteral}
      AND c.relname IN (${literalList(NEW_TABLES)})
      AND a.attnum > 0
      AND NOT a.attisdropped
  `);
  const actualColumns = new Map<string, { type: string; nullable: boolean }>();
  for (const row of columnRows) actualColumns.set(`${row.table_name}.${row.column_name}`, { type: row.type_name, nullable: row.nullable });
  for (const [table, columns] of Object.entries(EXPECTED_COLUMNS)) {
    const expectedNames = new Set(columns.map(([name]) => name));
    const actualNames = columnRows.filter((row) => row.table_name === table).map((row) => row.column_name);
    for (const name of actualNames) if (!expectedNames.has(name)) problems.push(`Columna inesperada ${table}.${name}.`);
    for (const [name, type, nullable] of columns) {
      const actual = actualColumns.get(`${table}.${name}`);
      if (!actual || !columnTypeMatches(type, actual.type) || actual.nullable !== nullable) {
        problems.push(`Columna inesperada ${table}.${name}.`);
      }
    }
  }

  const actualIndexes = new Map(indexRows.map((row) => [row.index_name, row.is_unique]));
  for (const [name, unique] of Object.entries(EXPECTED_INDEXES)) {
    if (actualIndexes.get(name) !== unique) problems.push(`Índice/unique inesperado ${name}.`);
  }
  const actualForeignKeys = new Map(foreignKeyRows.map((row) => [row.constraint_name, row]));
  for (const [name, [deleteType, referencedTable]] of Object.entries(EXPECTED_FOREIGN_KEYS)) {
    const actual = actualForeignKeys.get(name);
    if (!actual || actual.delete_type !== deleteType || actual.update_type !== "c" || actual.referenced_table !== referencedTable) {
      problems.push(`FK/onDelete inesperado ${name}.`);
    }
  }

  return {
    state: problems.length === 0 ? "COMPLETE" : "PARTIAL_ABORT",
    missingHistoricalTables: [],
    problems,
  };
}

export async function runHoursAuthMigration(
  prisma: PrismaClient,
  options: { schema?: string; onEvent?: (event: string) => void; statements?: readonly string[] } = {},
): Promise<MigrationRunResult> {
  const schema = options.schema ?? HOURS_AUTH_SCHEMA;
  assertSchemaName(schema);
  const emit = options.onEvent ?? (() => undefined);

  const inspection = await inspectHoursAuthMigration(prisma, schema);
  if (inspection.state === "COMPLETE") {
    emit("PRECHECK_COMPLETE");
    emit("MIGRATION_SKIPPED");
    return { state: "SKIP", executedStatements: 0 };
  }
  if (inspection.state === "PARTIAL_ABORT") {
    emit("PRECHECK_PARTIAL_ABORT");
    throw new Error(`Estado parcial de Auth/Tiempos: ${inspection.problems.join(" ")}`);
  }
  if (inspection.state === "HISTORICAL_SCHEMA_MISSING_ABORT") {
    emit("PRECHECK_HISTORICAL_SCHEMA_MISSING_ABORT");
    throw new Error(`Faltan tablas históricas: ${inspection.missingHistoricalTables.join(", ")}`);
  }

  emit("PRECHECK_NOT_APPLIED");
  const statements = options.statements ?? getHoursAuthMigrationStatements();
  const operations = [
    prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('broco:hours-auth-v1-migration'))"),
    prisma.$executeRawUnsafe(`SET LOCAL search_path TO ${quoteIdentifier(schema)}`),
    ...statements.map((statement, index) => {
      emit(ddlLabel(statement, index + 1));
      // Each item is one statement; Prisma sends the whole array as one DB transaction.
      return prisma.$executeRawUnsafe(statement);
    }),
  ];

  try {
    // Batch transactions avoid Prisma's interactive transaction protocol, which
    // expired in Prisma Postgres while DDL was being executed.
    await prisma.$transaction(operations, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    // A concurrent runner may have committed the complete migration while this
    // batch was waiting for the advisory lock. Treat its duplicate-object error
    // as the safe idempotent outcome; all other failures remain fatal.
    const afterFailure = await inspectHoursAuthMigration(prisma, schema);
    if (afterFailure.state === "COMPLETE") {
      emit("PRECHECK_COMPLETE");
      emit("MIGRATION_SKIPPED");
      return { state: "SKIP", executedStatements: 0 };
    }
    throw error;
  }

  // The batch has committed atomically. Keep the full structural postcheck as
  // an explicit, auditable verification of the committed result.
  const postcheck = await inspectHoursAuthMigration(prisma, schema);
  if (postcheck.state !== "COMPLETE") {
    throw new Error(`POSTCHECK_ABORT: ${postcheck.problems.join(" ") || postcheck.state}`);
  }
  emit("POSTCHECK_COMPLETE");
  emit("MIGRATION_COMPLETED");
  return { state: "APPLIED", executedStatements: statements.length };
}
