import type { Prisma, PrismaClient } from "@prisma/client";

type SqlClient = PrismaClient | Prisma.TransactionClient;

export type SotInventory = {
  format: "broco-sot-inventory-v1";
  capturedAt: string;
  counts: Record<string, number>;
  relationships: Record<string, unknown[]>;
};

async function query<T>(client: SqlClient, sql: string): Promise<T[]> {
  return client.$queryRawUnsafe<T[]>(sql);
}

async function count(client: SqlClient, table: string): Promise<number> {
  const rows = await query<{ count: number }>(client, `SELECT count(*)::int AS count FROM "${table}"`);
  return rows[0]?.count ?? 0;
}

/** Read-only, deterministic SOT fingerprint. It deliberately excludes new Auth/Tiempos tables. */
export async function captureSotInventory(client: SqlClient): Promise<SotInventory> {
  const countTables = [
    ["Client", "clients"], ["Project", "projects"], ["Income", "incomes"], ["Expense", "expenses"],
    ["IncomeType", "income_types"], ["ExpenseCategory", "expense_categories"], ["ProjectPhase", "project_phases"],
    ["ProjectTask", "project_tasks"], ["ProjectShareLink", "project_share_links"],
  ] as const;
  const counts = Object.fromEntries(await Promise.all(countTables.map(async ([name, table]) => [name, await count(client, table)])));

  const relationships = {
    projectsByClient: await query(client, `SELECT client_id::text AS "clientId", count(*)::int AS count FROM projects GROUP BY client_id ORDER BY client_id`),
    incomesByClientProjectStatus: await query(client, `SELECT COALESCE(client_id::text, '(null)') AS "clientId", COALESCE(project_id::text, '(null)') AS "projectId", status::text AS status, count(*)::int AS count, COALESCE(sum(amount_usd), 0)::text AS "amountUsd" FROM incomes GROUP BY client_id, project_id, status ORDER BY client_id, project_id, status`),
    expensesByProjectStatus: await query(client, `SELECT COALESCE(project_id::text, '(null)') AS "projectId", status::text AS status, count(*)::int AS count, COALESCE(sum(amount_usd), 0)::text AS "amountUsd" FROM expenses GROUP BY project_id, status ORDER BY project_id, status`),
    phasesByProject: await query(client, `SELECT project_id::text AS "projectId", count(*)::int AS count FROM project_phases GROUP BY project_id ORDER BY project_id`),
    tasksByProject: await query(client, `SELECT project_id::text AS "projectId", count(*)::int AS count FROM project_tasks GROUP BY project_id ORDER BY project_id`),
    shareLinksByProject: await query(client, `SELECT project_id::text AS "projectId", count(*)::int AS count FROM project_share_links GROUP BY project_id ORDER BY project_id`),
  };

  return { format: "broco-sot-inventory-v1", capturedAt: new Date().toISOString(), counts, relationships };
}

function stableJson(value: unknown) {
  return JSON.stringify(value);
}

export function compareSotInventories(before: SotInventory, after: SotInventory): string[] {
  const differences: string[] = [];
  if (before.format !== "broco-sot-inventory-v1" || after.format !== "broco-sot-inventory-v1") {
    return ["Formato de inventario no reconocido."];
  }
  for (const key of new Set([...Object.keys(before.counts), ...Object.keys(after.counts)])) {
    if (before.counts[key] !== after.counts[key]) differences.push(`Conteo distinto: ${key}.`);
  }
  for (const key of new Set([...Object.keys(before.relationships), ...Object.keys(after.relationships)])) {
    if (stableJson(before.relationships[key]) !== stableJson(after.relationships[key])) {
      differences.push(`Relación/agregado distinto: ${key}.`);
    }
  }
  return differences;
}
