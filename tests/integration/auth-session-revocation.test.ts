import { afterEach, describe, expect, it, vi } from "vitest";
import { hash } from "bcryptjs";
import { prisma } from "@/server/prisma";

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("REDIRECTED"); }) }));

const { getCurrentUser, requireRole } = await import("@/lib/auth");
const { updateAppUser, setAppUserActive } = await import("@/server/services/users");
const createdIds: string[] = [];
const hasDb = Boolean(process.env.DATABASE_URL_TEST);
const suite = hasDb ? describe : describe.skip;

suite("revocación server-side de Auth.js", () => {
  afterEach(async () => {
    getServerSession.mockReset();
    await prisma.appUser.deleteMany({ where: { id: { in: createdIds.splice(0) } } });
  });

  async function activeAdmin(label: string) {
    const user = await prisma.appUser.create({ data: { name: label, email: `${label}-${crypto.randomUUID()}@test.local`, passwordHash: await hash("temporary-password", 12), role: "ADMIN", isActive: true } });
    createdIds.push(user.id);
    getServerSession.mockResolvedValue({ user: { id: user.id, sessionVersion: user.sessionVersion } });
    return user;
  }

  it("rechaza el JWT previo después de degradar un ADMIN", async () => {
    const user = await activeAdmin("stale-role");
    await updateAppUser(user.id, { name: user.name, email: user.email, role: "COLLABORATOR" });
    await expect(getCurrentUser()).resolves.toBeNull();
    await expect(requireRole("ADMIN")).rejects.toThrow("REDIRECTED");
  });

  it("rechaza el JWT previo después de desactivar un ADMIN", async () => {
    const user = await activeAdmin("stale-active");
    await setAppUserActive(user.id, false);
    await expect(getCurrentUser()).resolves.toBeNull();
    await expect(requireRole("ADMIN")).rejects.toThrow("REDIRECTED");
  });
});
