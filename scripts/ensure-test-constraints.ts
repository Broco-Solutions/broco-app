import { PrismaClient } from "@prisma/client";
import { assertLocalTestDatabaseUrl } from "@/lib/test-db-guard";

const testUrl = process.env.DATABASE_URL_TEST;
const appUrl = process.env.DATABASE_URL;

function requireLocalTestDatabase() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Este script solo puede ejecutarse con NODE_ENV=test.");
  }
  if (!testUrl || !appUrl || testUrl === appUrl) {
    throw new Error("DATABASE_URL y DATABASE_URL_TEST deben existir y ser distintas.");
  }

  assertLocalTestDatabaseUrl(testUrl);
}

async function main() {
  requireLocalTestDatabase();
  const prisma = new PrismaClient({ datasources: { db: { url: testUrl } } });

  const statements = [
    `ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "chk_client_name_not_empty"`,
    `ALTER TABLE "clients" ADD CONSTRAINT "chk_client_name_not_empty" CHECK (btrim("name") <> '')`,
    `ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "chk_project_name_not_empty"`,
    `ALTER TABLE "projects" ADD CONSTRAINT "chk_project_name_not_empty" CHECK (btrim("name") <> '')`,
    `ALTER TABLE "expense_categories" DROP CONSTRAINT IF EXISTS "chk_expense_category_name_not_empty"`,
    `ALTER TABLE "expense_categories" ADD CONSTRAINT "chk_expense_category_name_not_empty" CHECK (btrim("name") <> '')`,

    `ALTER TABLE "incomes" DROP CONSTRAINT IF EXISTS "chk_income_amount_usd_positive"`,
    `ALTER TABLE "incomes" ADD CONSTRAINT "chk_income_amount_usd_positive" CHECK ("amount_usd" > 0)`,
    `ALTER TABLE "incomes" DROP CONSTRAINT IF EXISTS "chk_income_amount_ars_positive"`,
    `ALTER TABLE "incomes" ADD CONSTRAINT "chk_income_amount_ars_positive" CHECK ("amount_ars" IS NULL OR "amount_ars" > 0)`,
    `ALTER TABLE "incomes" DROP CONSTRAINT IF EXISTS "chk_income_exchange_rate_positive"`,
    `ALTER TABLE "incomes" ADD CONSTRAINT "chk_income_exchange_rate_positive" CHECK ("exchange_rate" IS NULL OR "exchange_rate" > 0)`,
    `ALTER TABLE "incomes" DROP CONSTRAINT IF EXISTS "chk_income_ars_fx_together"`,
    `ALTER TABLE "incomes" ADD CONSTRAINT "chk_income_ars_fx_together" CHECK (("amount_ars" IS NULL AND "exchange_rate" IS NULL) OR ("amount_ars" IS NOT NULL AND "exchange_rate" IS NOT NULL))`,
    `ALTER TABLE "incomes" DROP CONSTRAINT IF EXISTS "chk_income_pending_requires_due_date"`,
    `ALTER TABLE "incomes" ADD CONSTRAINT "chk_income_pending_requires_due_date" CHECK ("status" != 'PENDING' OR "due_date" IS NOT NULL)`,
    `ALTER TABLE "incomes" DROP CONSTRAINT IF EXISTS "chk_income_pending_no_effective_date"`,
    `ALTER TABLE "incomes" ADD CONSTRAINT "chk_income_pending_no_effective_date" CHECK ("status" != 'PENDING' OR "effective_date" IS NULL)`,
    `ALTER TABLE "incomes" DROP CONSTRAINT IF EXISTS "chk_income_paid_requires_effective_date"`,
    `ALTER TABLE "incomes" ADD CONSTRAINT "chk_income_paid_requires_effective_date" CHECK ("status" != 'PAID' OR "effective_date" IS NOT NULL)`,
    `ALTER TABLE "incomes" DROP CONSTRAINT IF EXISTS "chk_income_monetary_consistency"`,
    `ALTER TABLE "incomes" ADD CONSTRAINT "chk_income_monetary_consistency" CHECK ("amount_ars" IS NULL OR "exchange_rate" IS NULL OR ABS(("amount_ars" / "exchange_rate") - "amount_usd") < 0.00001)`,

    `ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "chk_expense_amount_usd_positive"`,
    `ALTER TABLE "expenses" ADD CONSTRAINT "chk_expense_amount_usd_positive" CHECK ("amount_usd" > 0)`,
    `ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "chk_expense_amount_ars_positive"`,
    `ALTER TABLE "expenses" ADD CONSTRAINT "chk_expense_amount_ars_positive" CHECK ("amount_ars" IS NULL OR "amount_ars" > 0)`,
    `ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "chk_expense_exchange_rate_positive"`,
    `ALTER TABLE "expenses" ADD CONSTRAINT "chk_expense_exchange_rate_positive" CHECK ("exchange_rate" IS NULL OR "exchange_rate" > 0)`,
    `ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "chk_expense_ars_fx_together"`,
    `ALTER TABLE "expenses" ADD CONSTRAINT "chk_expense_ars_fx_together" CHECK (("amount_ars" IS NULL AND "exchange_rate" IS NULL) OR ("amount_ars" IS NOT NULL AND "exchange_rate" IS NOT NULL))`,
    `ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "chk_expense_pending_requires_due_date"`,
    `ALTER TABLE "expenses" ADD CONSTRAINT "chk_expense_pending_requires_due_date" CHECK ("status" != 'PENDING' OR "due_date" IS NOT NULL)`,
    `ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "chk_expense_pending_no_effective_date"`,
    `ALTER TABLE "expenses" ADD CONSTRAINT "chk_expense_pending_no_effective_date" CHECK ("status" != 'PENDING' OR "effective_date" IS NULL)`,
    `ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "chk_expense_paid_requires_effective_date"`,
    `ALTER TABLE "expenses" ADD CONSTRAINT "chk_expense_paid_requires_effective_date" CHECK ("status" != 'PAID' OR "effective_date" IS NOT NULL)`,
    `ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "chk_expense_monetary_consistency"`,
    `ALTER TABLE "expenses" ADD CONSTRAINT "chk_expense_monetary_consistency" CHECK ("amount_ars" IS NULL OR "exchange_rate" IS NULL OR ABS(("amount_ars" / "exchange_rate") - "amount_usd") < 0.00001)`,

    `ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "chk_project_one_time_amount_consistency"`,
    `ALTER TABLE "projects" ADD CONSTRAINT "chk_project_one_time_amount_consistency" CHECK ("one_time_original_amount" IS NULL OR ("one_time_currency" IS NOT NULL AND "one_time_amount_usd" IS NOT NULL AND "one_time_original_amount" > 0 AND (("one_time_currency" = 'USD' AND "one_time_exchange_rate" IS NULL AND "one_time_amount_usd" = "one_time_original_amount") OR ("one_time_currency" = 'ARS' AND "one_time_exchange_rate" IS NOT NULL AND "one_time_exchange_rate" > 0))))`,
    `ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "chk_project_one_time_ars_consistency"`,
    `ALTER TABLE "projects" ADD CONSTRAINT "chk_project_one_time_ars_consistency" CHECK ("one_time_currency" IS NULL OR "one_time_currency" != 'ARS' OR "one_time_exchange_rate" IS NULL OR ABS(("one_time_original_amount" / "one_time_exchange_rate") - "one_time_amount_usd") < 0.00001)`,
    `ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "chk_project_monthly_amount_consistency"`,
    `ALTER TABLE "projects" ADD CONSTRAINT "chk_project_monthly_amount_consistency" CHECK ("monthly_recurring_original_amount" IS NULL OR ("monthly_recurring_currency" IS NOT NULL AND "monthly_recurring_amount_usd" IS NOT NULL AND "monthly_recurring_original_amount" > 0 AND (("monthly_recurring_currency" = 'USD' AND "monthly_recurring_exchange_rate" IS NULL AND "monthly_recurring_amount_usd" = "monthly_recurring_original_amount") OR ("monthly_recurring_currency" = 'ARS' AND "monthly_recurring_exchange_rate" IS NOT NULL AND "monthly_recurring_exchange_rate" > 0))))`,
    `ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "chk_project_monthly_ars_consistency"`,
    `ALTER TABLE "projects" ADD CONSTRAINT "chk_project_monthly_ars_consistency" CHECK ("monthly_recurring_currency" IS NULL OR "monthly_recurring_currency" != 'ARS' OR "monthly_recurring_exchange_rate" IS NULL OR ABS(("monthly_recurring_original_amount" / "monthly_recurring_exchange_rate") - "monthly_recurring_amount_usd") < 0.00001)`,

    `CREATE UNIQUE INDEX IF NOT EXISTS "clients_name_unique_ci" ON "clients" (lower(btrim("name")))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "expense_categories_name_unique_ci" ON "expense_categories" (lower(btrim("name")))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "projects_client_id_name_unique_ci" ON "projects" ("client_id", lower(btrim("name")))`,
  ];

  try {
    for (const [index, statement] of statements.entries()) {
      try {
        await prisma.$executeRawUnsafe(statement);
      } catch (error) {
        throw new Error(`Sentencia ${index + 1}: ${statement}`, { cause: error });
      }
    }
    console.log(`Constraints e índices de test aplicados: ${statements.length} sentencias.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("No se pudo inicializar el schema de constraints de test:", error);
  process.exit(1);
});
