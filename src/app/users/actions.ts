"use server";

import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/server/prisma";
import { issueActivationToken } from "@/server/access-tokens";
import { setAppUserActive, updateAppUser } from "@/server/services/users";

export async function saveUser(formData: FormData) {
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "COLLABORATOR") === "ADMIN" ? "ADMIN" : "COLLABORATOR";
  if (!name || !email) throw new Error("Nombre y correo son obligatorios.");

  if (id) {
    await updateAppUser(id, { name, email, role });
  } else {
    const temporaryPassword = randomBytes(32).toString("hex");
    await prisma.appUser.create({ data: { name, email, role, passwordHash: await hash(temporaryPassword, 12), isActive: false } });
  }
  revalidatePath("/users");
  revalidatePath("/users");
  revalidatePath("/hours");
}

export async function createActivationLink(formData: FormData): Promise<{ success: true; path: string } | { success: false; message: string }> {
  await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  try {
    const raw = await issueActivationToken(userId);
    return { success: true, path: `/hours/activate?token=${encodeURIComponent(raw)}` };
  } catch (cause) {
    return { success: false, message: cause instanceof Error ? cause.message : "No se pudo generar el enlace." };
  }
}

export async function toggleUser(formData: FormData) {
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  await setAppUserActive(id, !active);
  revalidatePath("/users");
  revalidatePath("/users");
}
