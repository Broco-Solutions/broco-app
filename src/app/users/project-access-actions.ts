"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/server/prisma";

export async function toggleProjectAccess(formData: FormData) {
  await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const assigned = formData.get("assigned") === "true";
  const user = await prisma.appUser.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role !== "COLLABORATOR") throw new Error("Sólo los colaboradores tienen acceso a proyectos configurable.");
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { isActive: true } });
  if (!project?.isActive) throw new Error("Sólo se pueden habilitar proyectos activos.");
  if (assigned) {
    await prisma.userProjectAccess.delete({ where: { userId_projectId: { userId, projectId } } }).catch(() => undefined);
  } else {
    await prisma.userProjectAccess.create({ data: { userId, projectId } }).catch(() => undefined);
  }
  revalidatePath("/users");
  revalidatePath(`/users/${userId}`);
}
