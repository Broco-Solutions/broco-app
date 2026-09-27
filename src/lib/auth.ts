import "server-only";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma } from "@/server/prisma";
import { authOptions } from "@/server/auth-options";

export type AppRole = "ADMIN" | "COLLABORATOR";
export type CurrentUser = { id: string; name: string; email: string; role: AppRole; sessionVersion: number };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (!id) return null;
  const user = await prisma.appUser.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: true, isActive: true, sessionVersion: true } });
  if (!user?.isActive || user.sessionVersion !== session.user.sessionVersion) return null;
  return user;
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(role: AppRole): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== role) redirect(user.role === "COLLABORATOR" ? "/hours" : "/");
  return user;
}

export function isLegacySessionCookieName(name: string) {
  return name === "broco_session";
}
