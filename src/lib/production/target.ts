import { assertLocalTestDatabaseUrl } from "@/lib/test-db-guard";

export type ProductionTarget = {
  databaseUrl: string;
  mode: "production" | "local-test";
};

type Environment = Record<string, string | undefined>;

function parseUrl(rawUrl: string, variableName: string): URL {
  try {
    return new URL(rawUrl);
  } catch {
    throw new Error(`${variableName} no es una URL válida.`);
  }
}

/**
 * The production runner is deliberately narrower than a generic Prisma
 * script: it only accepts the Accelerate endpoint documented for Broco.
 * A new infrastructure endpoint must be reviewed before it can run DDL.
 */
export function assertProductionAccelerateUrl(rawUrl: string | undefined): string {
  if (!rawUrl) throw new Error("DATABASE_URL es obligatoria para una operación productiva.");

  const url = parseUrl(rawUrl, "DATABASE_URL");
  if (url.protocol !== "prisma+postgres:") {
    throw new Error("La migración productiva requiere una URL prisma+postgres de Prisma Accelerate.");
  }
  if (url.hostname !== "db.prisma.io") {
    throw new Error("La migración productiva solo acepta el endpoint Accelerate aprobado (db.prisma.io).");
  }

  return rawUrl;
}

export function resolveProductionTarget(env: Environment = process.env): ProductionTarget {
  if (env.ALLOW_PRODUCTION_MIGRATION !== "true") {
    throw new Error("Definí ALLOW_PRODUCTION_MIGRATION=true explícitamente antes de ejecutar DDL productivo.");
  }

  return {
    databaseUrl: assertProductionAccelerateUrl(env.DATABASE_URL),
    mode: "production",
  };
}

export function resolveInventoryTarget(env: Environment = process.env): ProductionTarget {
  if (env.ALLOW_PRODUCTION_INVENTORY !== "true") {
    throw new Error("Definí ALLOW_PRODUCTION_INVENTORY=true explícitamente antes de consultar inventario productivo.");
  }

  return {
    databaseUrl: assertProductionAccelerateUrl(env.DATABASE_URL),
    mode: "production",
  };
}

/** Only tests may opt into the fixed, isolated local target. */
export function resolveLocalTestTarget(env: Environment = process.env): ProductionTarget {
  if (env.NODE_ENV !== "test" || env.ALLOW_LOCAL_MIGRATION_TEST !== "true") {
    throw new Error("La ejecución local del runner requiere NODE_ENV=test y ALLOW_LOCAL_MIGRATION_TEST=true.");
  }

  return {
    databaseUrl: assertLocalTestDatabaseUrl(env.DATABASE_URL_TEST),
    mode: "local-test",
  };
}

/** Bootstrap is a write operation too: it may only target the reviewed production endpoint. */
export function resolveBootstrapTarget(env: Environment = process.env): ProductionTarget {
  if (env.ALLOW_ADMIN_BOOTSTRAP !== "true") {
    throw new Error("Definí ALLOW_ADMIN_BOOTSTRAP=true explícitamente antes de crear el administrador inicial.");
  }

  if (env.NODE_ENV === "test") {
    if (env.ALLOW_LOCAL_BOOTSTRAP_TEST !== "true") {
      throw new Error("El bootstrap local requiere ALLOW_LOCAL_BOOTSTRAP_TEST=true.");
    }
    return { databaseUrl: assertLocalTestDatabaseUrl(env.DATABASE_URL_TEST), mode: "local-test" };
  }

  return { databaseUrl: assertProductionAccelerateUrl(env.DATABASE_URL), mode: "production" };
}
