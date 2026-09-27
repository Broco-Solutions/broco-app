"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { hashAccessToken } from "@/server/access-tokens";
import { prisma } from "@/server/prisma";

export async function saveUser(formData: FormData) {
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "COLLABORATOR") === "ADMIN" ? "ADMIN" : "COLLABORATOR";
  if (!name || !email) throw new Error("Nombre y correo son obligatorios.");

  if (id) {
    const existing = await prisma.appUser.findUniqueOrThrow({ where: { id } });
    if (existing.role === "ADMIN" && role !== "ADMIN" && (await prisma.appUser.count({ where: { role: "ADMIN", isActive: true } })) <= 1) {
      throw new Error("No se puede desproteger al último administrador.");
    }
    await prisma.appUser.update({ where: { id }, data: { name, email, role } });
  } else {
    const temporaryPassword = randomBytes(32).toString("hex");
    await prisma.appUser.create({ data: { name, email, role, passwordHash: await hash(temporaryPassword, 12), isActive: false } });
  }
  revalidatePath("/users");
  revalidatePath("/hours/team");
  revalidatePath("/hours");
}

export async function createActivationLink(formData: FormData) {
  await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  const user = await prisma.appUser.findUniqueOrThrow({ where: { id: userId }, select: { id: true, isActive: true } });
  if (user.isActive) throw new Error("La cuenta ya está activa.");
  const raw = randomBytes(32).toString("base64url");
  await prisma.accessToken.create({ data: { userId: user.id, tokenHash: hashAccessToken(raw), purpose: "ACTIVATE", expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
  redirect(`/hours/activate?token=${encodeURIComponent(raw)}`);
}

export async function toggleUser(formData: FormData) {
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  const user = await prisma.appUser.findUniqueOrThrow({ where: { id } });
  if (user.role === "ADMIN" && active && (await prisma.appUser.count({ where: { role: "ADMIN", isActive: true } })) <= 1) {
    throw new Error("No se puede desactivar al último administrador.");
  }
  await prisma.appUser.update({ where: { id }, data: { isActive: !active, sessionVersion: { increment: 1 } } });
  revalidatePath("/users");
  revalidatePath("/hours/team");
}
