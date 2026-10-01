import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { runMcpIdentitiesMigration } from "@/lib/production/mcp-identities-migration";
import { resolveProductionTarget } from "@/lib/production/target";

async function main() {
  const target = resolveProductionTarget();
  const prisma = new PrismaClient({ datasources: { db: { url: target.directUrl } } });
  try {
    console.log("PRODUCTION_TARGET_VALIDATED");
    const result = await runMcpIdentitiesMigration(prisma, { onEvent: (event) => console.log(event) });
    console.log(`RUNNER_RESULT_${result.state}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Error desconocido en migración.");
  process.exitCode = 1;
});
