function redactUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.password) {
      url.password = "***";
    }
    return url.toString();
  } catch {
    if (rawUrl.length <= 12) return rawUrl;
    return rawUrl.slice(0, 12) + "...";
  }
}

function extractDbName(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname.replace(/^\//, "");
    return path || null;
  } catch {
    return null;
  }
}

const LOCAL_TEST_HOST = "localhost";
const LOCAL_TEST_PORT = "5434";
const LOCAL_TEST_DATABASE = "broco_finance_test";

/**
 * Returns only the explicitly authorized test target. This guard is intended
 * for scripts that may write fixtures, so a merely different or test-looking
 * database name is not sufficient.
 */
export function assertLocalTestDatabaseUrl(rawUrl: string | undefined): string {
  if (!rawUrl) {
    throw new Error("DATABASE_URL_TEST es obligatoria.");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("DATABASE_URL_TEST no es una URL válida.");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL_TEST debe usar PostgreSQL.");
  }
  if (parsed.hostname !== LOCAL_TEST_HOST) {
    throw new Error("DATABASE_URL_TEST debe apuntar exactamente a localhost.");
  }
  if (parsed.port !== LOCAL_TEST_PORT) {
    throw new Error("DATABASE_URL_TEST debe usar el puerto 5434.");
  }
  if (parsed.pathname !== `/${LOCAL_TEST_DATABASE}`) {
    throw new Error("DATABASE_URL_TEST debe apuntar exactamente a broco_finance_test.");
  }

  return rawUrl;
}

/**
 * Fails closed before read-only integration tests use the application's shared
 * Prisma client. It deliberately accepts only the isolated local test database.
 */
export function assertReadOnlyTestDatabase() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error('NODE_ENV debe ser "test" para integración MCP.');
  }

  const databaseUrl = process.env.DATABASE_URL;
  const testDatabaseUrl = process.env.DATABASE_URL_TEST;
  if (!databaseUrl || !testDatabaseUrl) {
    throw new Error(
      "DATABASE_URL y DATABASE_URL_TEST deben estar definidas para integración MCP.",
    );
  }
  if (databaseUrl !== testDatabaseUrl) {
    throw new Error(
      "DATABASE_URL debe coincidir exactamente con DATABASE_URL_TEST para integración MCP.",
    );
  }

  const databaseName = extractDbName(assertLocalTestDatabaseUrl(testDatabaseUrl));

  return { databaseName };
}

export function assertTestDatabase() {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv !== "test") {
    throw new Error(
      `NODE_ENV debe ser "test" para operaciones destructivas. Valor actual: ${JSON.stringify(nodeEnv ?? "no definido")}`,
    );
  }

  const allowDestructive = process.env.ALLOW_DESTRUCTIVE_TEST_DB;
  if (allowDestructive !== "true") {
    throw new Error(
      `ALLOW_DESTRUCTIVE_TEST_DB debe ser "true" para operaciones destructivas. Valor actual: ${JSON.stringify(allowDestructive ?? "no definido")}`,
    );
  }

  const testDbUrl = process.env.DATABASE_URL_TEST;
  if (!testDbUrl) {
    throw new Error(
      "DATABASE_URL_TEST no esta definida. Debe apuntar a una base de test aislada.",
    );
  }

  const prodDbUrl = process.env.DATABASE_URL;
  if (!prodDbUrl) {
    throw new Error(
      "DATABASE_URL no esta definida. Debe estar configurada aunque no se use para test, como proteccion adicional.",
    );
  }

  if (testDbUrl === prodDbUrl) {
    throw new Error(
      `DATABASE_URL_TEST es identica a DATABASE_URL (${redactUrl(testDbUrl)}). Deben ser bases distintas para proteger produccion.`,
    );
  }

  const validatedTestDbUrl = assertLocalTestDatabaseUrl(testDbUrl);
  const testDbName = extractDbName(validatedTestDbUrl);

  return {
    testDbUrl: validatedTestDbUrl,
    testDbName,
    nodeEnv,
  };
}
