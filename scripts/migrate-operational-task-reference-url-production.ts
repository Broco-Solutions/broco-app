import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { runOperationalTaskReferenceUrlMigration } from "@/lib/production/operational-task-reference-url-migration";
import { resolveProductionTarget } from "@/lib/production/target";

async function main() {
  const target = resolveProductionTarget();
  const prisma = new PrismaClient({ datasources: { db: { url: target.directUrl } } });
  try {
    console.log("PRODUCTION_TARGET_VALIDATED");
    const result = await runOperationalTaskReferenceUrlMigration(prisma, { onEvent: (event) => console.log(event) });
    console.log(`RUNNER_RESULT_${result.state}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Error desconocido en migración.");
  process.exitCode = 1;
});
