import "server-only";
import { Prisma, type AppUserRole } from "@prisma/client";
import { prisma } from "@/server/prisma";

async function withAdminMutationLock<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('broco:last-active-admin'))`;
    return operation(tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateAppUser(id: string, data: { name: string; email: string; role: AppUserRole }) {
  return withAdminMutationLock(async (tx) => {
    const existing = await tx.appUser.findUniqueOrThrow({ where: { id } });
    if (existing.isActive && existing.role === "ADMIN" && data.role !== "ADMIN") {
      const activeAdmins = await tx.appUser.count({ where: { role: "ADMIN", isActive: true } });
      if (activeAdmins <= 1) throw new Error("No se puede desproteger al último administrador.");
    }
    return tx.appUser.update({
      where: { id },
      data: {
        name: data.name,
        email: data.email,
        role: data.role,
        ...(existing.role !== data.role ? { sessionVersion: { increment: 1 } } : {}),
      },
    });
  });
}

export async function setAppUserActive(id: string, isActive: boolean) {
  return withAdminMutationLock(async (tx) => {
    const user = await tx.appUser.findUniqueOrThrow({ where: { id } });
    if (user.isActive === isActive) return user;
    if (!isActive && user.role === "ADMIN") {
      const activeAdmins = await tx.appUser.count({ where: { role: "ADMIN", isActive: true } });
      if (activeAdmins <= 1) throw new Error("No se puede desactivar al último administrador.");
    }
    return tx.appUser.update({ where: { id }, data: { isActive, sessionVersion: { increment: 1 } } });
  });
}
