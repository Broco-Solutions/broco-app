import "dotenv/config";
import { hash } from "bcryptjs";
import { prisma } from "@/server/prisma";

async function main() {
  if (process.env.ALLOW_ADMIN_BOOTSTRAP !== "true") throw new Error("Definí ALLOW_ADMIN_BOOTSTRAP=true de forma explícita para crear el administrador inicial.");
  for (const name of ["ADMIN_BOOTSTRAP_NAME", "ADMIN_BOOTSTRAP_EMAIL", "ADMIN_BOOTSTRAP_PASSWORD"]) if (!process.env[name]) throw new Error(`Falta ${name}.`);
  if ((process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "").length < 12) throw new Error("ADMIN_BOOTSTRAP_PASSWORD debe tener al menos 12 caracteres.");
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL!.trim().toLowerCase();
  const adminCount = await prisma.appUser.count({ where: { role: "ADMIN" } });
  if (adminCount > 0) throw new Error("Ya existe un administrador; el bootstrap solo permite crear el administrador inicial.");
  const existing = await prisma.appUser.findUnique({ where: { email } });
  if (existing) throw new Error("El correo ya existe; no se sobrescribe ninguna cuenta.");
  await prisma.appUser.create({ data: { name: process.env.ADMIN_BOOTSTRAP_NAME!, email, passwordHash: await hash(process.env.ADMIN_BOOTSTRAP_PASSWORD!, 12), role: "ADMIN", isActive: true } });
  console.log("Administrador inicial creado.");
}

main().finally(() => prisma.$disconnect());
