import { assertLocalTestDatabaseUrl } from "@/lib/test-db-guard";

export type ProductionTarget = {
  directUrl: string;
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

/** Direct Prisma Postgres connection reserved for administrative operations. */
export function assertProductionDirectUrl(rawUrl: string | undefined): string {
  if (!rawUrl) throw new Error("DIRECT_URL es obligatoria para una operación productiva.");

  const url = parseUrl(rawUrl, "DIRECT_URL");
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DIRECT_URL debe usar PostgreSQL directo (postgres: o postgresql:).");
  }
  if (url.hostname !== "db.prisma.io") {
    throw new Error("DIRECT_URL solo acepta el host directo aprobado: db.prisma.io.");
  }
  if (url.port !== "5432") {
    throw new Error("DIRECT_URL debe usar el puerto 5432.");
  }
  if (url.pathname !== "/postgres") {
    throw new Error("DIRECT_URL debe apuntar exactamente a la base postgres.");
  }
  const sslModes = url.searchParams.getAll("sslmode");
  if (sslModes.length !== 1 || sslModes[0] !== "require") {
    throw new Error("DIRECT_URL debe incluir exactamente sslmode=require.");
  }
  for (const key of url.searchParams.keys()) {
    if (key !== "sslmode") throw new Error("DIRECT_URL contiene parámetros no autorizados.");
  }

  return rawUrl;
}

export function resolveProductionTarget(env: Environment = process.env): ProductionTarget {
  if (env.ALLOW_PRODUCTION_MIGRATION !== "true") {
    throw new Error("Definí ALLOW_PRODUCTION_MIGRATION=true explícitamente antes de ejecutar DDL productivo.");
  }

  return {
    directUrl: assertProductionDirectUrl(env.DIRECT_URL),
    mode: "production",
  };
}

export function resolveInventoryTarget(env: Environment = process.env): ProductionTarget {
  if (env.ALLOW_PRODUCTION_INVENTORY !== "true") {
    throw new Error("Definí ALLOW_PRODUCTION_INVENTORY=true explícitamente antes de consultar inventario productivo.");
  }

  return {
    directUrl: assertProductionDirectUrl(env.DIRECT_URL),
    mode: "production",
  };
}

/** Only tests may opt into the fixed, isolated local target. */
export function resolveLocalTestTarget(env: Environment = process.env): ProductionTarget {
  if (env.NODE_ENV !== "test" || env.ALLOW_LOCAL_MIGRATION_TEST !== "true") {
    throw new Error("La ejecución local del runner requiere NODE_ENV=test y ALLOW_LOCAL_MIGRATION_TEST=true.");
  }

  return {
    directUrl: assertLocalTestDatabaseUrl(env.DATABASE_URL_TEST),
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
    return { directUrl: assertLocalTestDatabaseUrl(env.DATABASE_URL_TEST), mode: "local-test" };
  }

  return { directUrl: assertProductionDirectUrl(env.DIRECT_URL), mode: "production" };
}
