import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { captureSotInventory } from "@/lib/production/sot-inventory";
import { resolveInventoryTarget, resolveLocalTestTarget } from "@/lib/production/target";

async function main() {
  const target = process.argv.includes("--local-test") ? resolveLocalTestTarget() : resolveInventoryTarget();
  const prisma = new PrismaClient({ datasources: { db: { url: target.directUrl } } });
  try {
    const inventory = await captureSotInventory(prisma);
    console.log(JSON.stringify(inventory, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Error desconocido al capturar inventario.");
  process.exitCode = 1;
});
