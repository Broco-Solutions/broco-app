import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/prisma";
export function hashAccessToken(token: string) { return createHash("sha256").update(token).digest("hex"); }

/** Cheap preflight only; activateAccountToken remains the authoritative atomic claim. */
export async function hasUsableActivationToken(token: string): Promise<boolean> {
  if (!token) return false;
  const access = await prisma.accessToken.findFirst({
    where: { tokenHash: hashAccessToken(token), purpose: "ACTIVATE", usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  return Boolean(access);
}

export async function getUsableActivationAccount(token: string): Promise<{ name: string; email: string } | null> {
  if (!token) return null;
  const access = await prisma.accessToken.findFirst({
    where: { tokenHash: hashAccessToken(token), purpose: "ACTIVATE", usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { user: { select: { name: true, email: true } } },
  });
  return access?.user ?? null;
}

const ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000;

export async function issueActivationToken(userId: string): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  const token = randomBytes(32).toString("base64url");
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const user = await tx.appUser.findUniqueOrThrow({ where: { id: userId }, select: { isActive: true } });
    if (user.isActive) throw new Error("La cuenta ya está activa.");
    await tx.accessToken.updateMany({
      where: { userId, purpose: "ACTIVATE", usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.accessToken.create({
      data: {
        userId,
        tokenHash: hashAccessToken(token),
        purpose: "ACTIVATE",
        expiresAt: new Date(now.getTime() + ACTIVATION_TTL_MS),
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return token;
}

/** Claims a token exactly once and activates its still-inactive owner atomically. */
export async function activateAccountToken(token: string, passwordHash: string): Promise<void> {
  const now = new Date();
  const tokenHash = hashAccessToken(token);

  await prisma.$transaction(async (tx) => {
    const access = await tx.accessToken.findFirst({
      where: { tokenHash, purpose: "ACTIVATE", usedAt: null, revokedAt: null, expiresAt: { gt: now } },
      select: { id: true, userId: true },
    });
    if (!access) throw new Error("El enlace no es válido o ya venció.");

    const claimed = await tx.accessToken.updateMany({
      where: { id: access.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw new Error("El enlace no es válido o ya fue utilizado.");

    const activated = await tx.appUser.updateMany({
      where: { id: access.userId, isActive: false },
      data: { passwordHash, isActive: true, sessionVersion: { increment: 1 } },
    });
    if (activated.count !== 1) throw new Error("La cuenta ya está activa o no es válida.");

    await tx.accessToken.updateMany({
      where: { userId: access.userId, purpose: "ACTIVATE", id: { not: access.id }, usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
