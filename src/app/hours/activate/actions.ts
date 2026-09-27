"use server";
import { redirect } from "next/navigation";
import { hash } from "bcryptjs";
import { prisma } from "@/server/prisma";
import { hashAccessToken } from "@/server/access-tokens";
export async function activateAccount(formData: FormData) { const token = String(formData.get("token") ?? ""); const password = String(formData.get("password") ?? ""); if (password.length < 12) throw new Error("La contraseña debe tener al menos 12 caracteres."); const result = await prisma.$transaction(async (tx) => { const access = await tx.accessToken.findFirst({ where: { tokenHash: hashAccessToken(token), purpose: "ACTIVATE", usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }); if (!access) throw new Error("El enlace no es válido o ya venció."); const user = await tx.appUser.update({ where: { id: access.userId }, data: { passwordHash: await hash(password, 12), isActive: true, sessionVersion: { increment: 1 } } }); await tx.accessToken.update({ where: { id: access.id }, data: { usedAt: new Date() } }); return user; }); void result; redirect("/login?activated=1"); }
