import { readFile } from "node:fs/promises";
import { compareSotInventories, type SotInventory } from "@/lib/production/sot-inventory";

async function readInventory(path: string): Promise<SotInventory> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as SotInventory;
  } catch {
    throw new Error(`No se pudo leer un inventario JSON válido: ${path}`);
  }
}

async function main() {
  const [beforePath, afterPath] = process.argv.slice(2);
  if (!beforePath || !afterPath) {
    throw new Error("Uso: pnpm prod:inventory:compare <pre.json> <post.json>");
  }
  const differences = compareSotInventories(await readInventory(beforePath), await readInventory(afterPath));
  if (differences.length > 0) {
    console.error(`INVENTORY_MISMATCH: ${differences.join(" ")}`);
    process.exitCode = 1;
    return;
  }
  console.log("INVENTORY_MATCH");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Error desconocido al comparar inventarios.");
  process.exitCode = 1;
});
