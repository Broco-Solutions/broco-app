import { afterEach, describe, expect, it } from "vitest";
import { hash } from "bcryptjs";
import { prisma } from "@/server/prisma";
import { activateAccountToken, issueActivationToken } from "@/server/access-tokens";
import { setAppUserActive, updateAppUser } from "@/server/services/users";

const hasDb = Boolean(process.env.DATABASE_URL_TEST);
const suite = hasDb ? describe : describe.skip;
const createdIds: string[] = [];

async function inactiveUser(label: string) {
  const user = await prisma.appUser.create({
    data: {
      name: label,
      email: `${label}-${crypto.randomUUID()}@test.local`,
      passwordHash: await hash("temporary-password", 12),
      isActive: false,
    },
  });
  createdIds.push(user.id);
  return user;
}

suite("regresiones de seguridad de usuarios", () => {
  afterEach(async () => {
    await prisma.appUser.deleteMany({ where: { id: { in: createdIds.splice(0) } } });
  });

  it("revoca el enlace anterior y permite activar exactamente una vez", async () => {
    const user = await inactiveUser("activation-single-use");
    const first = await issueActivationToken(user.id);
    const second = await issueActivationToken(user.id);
    const passwordHash = await hash("new-password-123", 12);

    await expect(activateAccountToken(first, passwordHash)).rejects.toThrow();
    await expect(activateAccountToken(second, passwordHash)).resolves.toBeUndefined();
    await expect(activateAccountToken(second, passwordHash)).rejects.toThrow();
    await expect(activateAccountToken(first, passwordHash)).rejects.toThrow();
    expect((await prisma.appUser.findUniqueOrThrow({ where: { id: user.id } })).isActive).toBe(true);
  });

  it("permite exactamente una activación concurrente", async () => {
    const user = await inactiveUser("activation-concurrent");
    const token = await issueActivationToken(user.id);
    const passwordHash = await hash("new-password-123", 12);
    const results = await Promise.allSettled([
      activateAccountToken(token, passwordHash),
      activateAccountToken(token, passwordHash),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("incrementa sessionVersion cuando cambia el rol", async () => {
    const user = await inactiveUser("role-session-version");
    const updated = await updateAppUser(user.id, { name: user.name, email: user.email, role: "ADMIN" });
    expect(updated.sessionVersion).toBe(user.sessionVersion + 1);
  });

  it("serializa dos desactivaciones y conserva un ADMIN activo", async () => {
    const first = await prisma.appUser.create({ data: { name: "admin-a", email: `admin-a-${crypto.randomUUID()}@test.local`, passwordHash: await hash("temporary-password", 12), role: "ADMIN", isActive: true } });
    const second = await prisma.appUser.create({ data: { name: "admin-b", email: `admin-b-${crypto.randomUUID()}@test.local`, passwordHash: await hash("temporary-password", 12), role: "ADMIN", isActive: true } });
    createdIds.push(first.id, second.id);
    const otherAdmins = await prisma.appUser.findMany({ where: { role: "ADMIN", isActive: true, id: { notIn: [first.id, second.id] } }, select: { id: true } });
    await prisma.appUser.updateMany({ where: { id: { in: otherAdmins.map((user) => user.id) } }, data: { isActive: false } });
    try {
      const results = await Promise.allSettled([setAppUserActive(first.id, false), setAppUserActive(second.id, false)]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(await prisma.appUser.count({ where: { role: "ADMIN", isActive: true } })).toBe(1);
    } finally {
      await prisma.appUser.updateMany({ where: { id: { in: otherAdmins.map((user) => user.id) } }, data: { isActive: true } });
    }
  });
});
