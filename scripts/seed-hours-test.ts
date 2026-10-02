import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { assertLocalTestDatabaseUrl } from "@/lib/test-db-guard";

async function main() {
  const databaseUrl = assertLocalTestDatabaseUrl(process.env.DATABASE_URL_TEST);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const password = process.env.HOURS_TEST_PASSWORD;
  if (!password || password.length < 12) throw new Error("HOURS_TEST_PASSWORD debe tener al menos 12 caracteres y solo se usa en el entorno de test.");
  const passwordHash = await hash(password, 4);
  async function client(name: string) { return prisma.client.findFirst({ where: { name } }).then((found) => found ?? prisma.client.create({ data: { name } })); }
  async function project(clientId: string, name: string) { return prisma.project.findFirst({ where: { clientId, name } }).then((found) => found ?? prisma.project.create({ data: { clientId, name, isActive: true } })); }
  async function user(name: string, email: string, role: "ADMIN" | "COLLABORATOR") { return prisma.appUser.upsert({ where: { email }, update: { name, role, passwordHash, isActive: true }, create: { name, email, role, passwordHash, isActive: true } }); }
  const [clientA, clientB] = await Promise.all([client("Horas Test Cliente A"), client("Horas Test Cliente B")]);
  const [projectA, projectB] = await Promise.all([project(clientA.id, "Horas Test Proyecto A1"), project(clientB.id, "Horas Test Proyecto B1")]);
  const [admin, collaboratorA, collaboratorB] = await Promise.all([user("Admin Horas Test", "admin@test.local", "ADMIN"), user("Colaborador A Test", "dev-a@test.local", "COLLABORATOR"), user("Colaborador B Test", "dev-b@test.local", "COLLABORATOR")]);
  await prisma.userProjectAccess.upsert({ where: { userId_projectId: { userId: collaboratorA.id, projectId: projectA.id } }, update: {}, create: { userId: collaboratorA.id, projectId: projectA.id } });
  await prisma.userProjectAccess.upsert({ where: { userId_projectId: { userId: collaboratorB.id, projectId: projectB.id } }, update: {}, create: { userId: collaboratorB.id, projectId: projectB.id } });
  console.log(JSON.stringify({ adminId: admin.id, collaboratorAId: collaboratorA.id, collaboratorBId: collaboratorB.id, projectAId: projectA.id, projectBId: projectB.id }));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("No se pudo preparar el fixture de Horas:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
