import type { AuthInfo } from "@modelcontextprotocol/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/prisma";
import { createMcpHttpHandler, createMcpProtocolHandler } from "@/server/mcp/http";
import { resolveMcpActorFromClaims } from "@/server/mcp/identity";
import type { EnabledMcpConfig } from "@/lib/mcp/config";

const hasDb = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL_TEST);
const provider = "https://issuer.security.test/";
const enabled: EnabledMcpConfig = {
  status: "ok", writeEnabled: true, resourceUrl: "https://broco.test/api/mcp", requiredScope: "mcp:read",
  auth: { issuer: provider, acceptedIssuers: [provider], audience: "https://broco.test/api/mcp", emailClaim: "email", emailVerifiedClaim: "email_verified" },
};
let adminId = "";
let collaboratorId = "";
let otherId = "";
let inactiveId = "";
let projectA = "";
let projectB = "";
let clientId = "";
let ownTask = "";
let foreignTask = "";

function auth(subject: string, scopes = ["mcp:read", "mcp:write"]): AuthInfo {
  return { token: `test-${subject}`, clientId: "test", scopes, expiresAt: Math.floor(Date.now() / 1000) + 60, extra: { provider, sub: subject } };
}

async function payload(response: Response) {
  const body = await response.text();
  const data = response.headers.get("content-type")?.includes("text/event-stream")
    ? body.split("\n").find((line) => line.startsWith("data: "))!.slice(6)
    : body;
  return JSON.parse(data) as { result?: { isError?: boolean; structuredContent?: any } };
}

async function call(subject: string, name: string, args: Record<string, unknown>, scopes?: string[]) {
  const run = createMcpHttpHandler({ readConfig: () => enabled, protocolHandler: createMcpProtocolHandler(true), tokenVerifier: () => async () => auth(subject, scopes) });
  return payload(await run(new Request(enabled.resourceUrl, {
    method: "POST",
    headers: { Authorization: "Bearer test", "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: `${subject}-${name}`, method: "tools/call", params: { name, arguments: args } }),
  })));
}

function errorCode(response: Awaited<ReturnType<typeof call>>) {
  return response.result?.structuredContent?.error?.code;
}

describe.skipIf(!hasDb)("MCP identidad y autorización", () => {
  beforeAll(async () => {
    const suffix = crypto.randomUUID();
    const [admin, collaborator, other, inactive] = await Promise.all([
      prisma.appUser.create({ data: { name: `mcp-admin-${suffix}`, email: `mcp-admin-${suffix}@test.local`, passwordHash: "test", role: "ADMIN", isActive: true } }),
      prisma.appUser.create({ data: { name: `mcp-col-${suffix}`, email: `mcp-col-${suffix}@test.local`, passwordHash: "test", role: "COLLABORATOR", isActive: true } }),
      prisma.appUser.create({ data: { name: `mcp-other-${suffix}`, email: `mcp-other-${suffix}@test.local`, passwordHash: "test", role: "COLLABORATOR", isActive: true } }),
      prisma.appUser.create({ data: { name: `mcp-inactive-${suffix}`, email: `mcp-inactive-${suffix}@test.local`, passwordHash: "test", role: "COLLABORATOR", isActive: false } }),
    ]);
    adminId = admin.id; collaboratorId = collaborator.id; otherId = other.id; inactiveId = inactive.id;
    await prisma.mcpIdentity.createMany({ data: [
      { provider, subject: "admin", appUserId: admin.id },
      { provider, subject: "collaborator", appUserId: collaborator.id },
      { provider, subject: "other", appUserId: other.id },
      { provider, subject: "inactive", appUserId: inactive.id },
    ] });
    const client = await prisma.client.create({ data: { name: `mcp-security-client-${suffix}` } }); clientId = client.id;
    const [a, b] = await Promise.all([
      prisma.project.create({ data: { clientId, name: `mcp-security-a-${suffix}` } }),
      prisma.project.create({ data: { clientId, name: `mcp-security-b-${suffix}` } }),
    ]);
    projectA = a.id; projectB = b.id;
    await prisma.userProjectAccess.create({ data: { userId: collaborator.id, projectId: a.id } });
    const [own, foreign] = await Promise.all([
      prisma.operationalTask.create({ data: { title: "Propia", creatorId: collaborator.id, assigneeId: collaborator.id, projectId: a.id } }),
      prisma.operationalTask.create({ data: { title: "Ajena", creatorId: admin.id, assigneeId: other.id, projectId: b.id } }),
    ]);
    ownTask = own.id; foreignTask = foreign.id;
  });

  afterAll(async () => {
    if (clientId) {
      await prisma.timeEntry.deleteMany({ where: { projectId: { in: [projectA, projectB] } } });
      await prisma.operationalTask.deleteMany({ where: { id: { in: [ownTask, foreignTask] } } });
      await prisma.userProjectAccess.deleteMany({ where: { userId: collaboratorId } });
      await prisma.project.deleteMany({ where: { id: { in: [projectA, projectB] } } });
      await prisma.client.deleteMany({ where: { id: clientId } });
    }
    await prisma.mcpIdentity.deleteMany({ where: { appUserId: { in: [adminId, collaboratorId, otherId, inactiveId] } } });
    await prisma.appUser.deleteMany({ where: { id: { in: [adminId, collaboratorId, otherId, inactiveId] } } });
    await prisma.$disconnect();
  });

  it("niega OAuth válido sin AppUser e inactivo", async () => {
    expect(errorCode(await call("unknown", "consultar_tiempos", {}))).toBe("APP_USER_REQUIRED");
    expect(errorCode(await call("inactive", "consultar_tiempos", {}))).toBe("APP_USER_INACTIVE");
    expect(errorCode(await call("unknown", "consultar_usuarios", { texto: "mcp" }))).toBe("APP_USER_REQUIRED");
    expect(errorCode(await call("inactive", "consultar_usuarios", { texto: "mcp" }))).toBe("APP_USER_INACTIVE");
  });

  it("permite al ADMIN buscar usuarios por nombre/email, filtrar, paginar y devuelve sólo el DTO operativo", async () => {
    const byName = await call("admin", "consultar_usuarios", { texto: "mcp-col" });
    expect(byName.result?.structuredContent.usuarios).toEqual([expect.objectContaining({ id: collaboratorId, nombre: expect.stringContaining("mcp-col"), email: expect.stringContaining("mcp-col"), rol: "COLLABORATOR", activo: true })]);
    const byEmail = await call("admin", "consultar_usuarios", { texto: (await prisma.appUser.findUniqueOrThrow({ where: { id: collaboratorId } })).email });
    expect(byEmail.result?.structuredContent.usuarios).toHaveLength(1);
    expect(byEmail.result?.structuredContent.usuarios[0].id).toBe(collaboratorId);
    const inactive = await call("admin", "consultar_usuarios", { activo: false });
    expect(inactive.result?.structuredContent.usuarios.map((user: { id: string }) => user.id)).toContain(inactiveId);
    const admins = await call("admin", "consultar_usuarios", { rol: "ADMIN" });
    expect(admins.result?.structuredContent.usuarios.every((user: { rol: string }) => user.rol === "ADMIN")).toBe(true);
    const page = await call("admin", "consultar_usuarios", { texto: "mcp", pagina: 1, limite: 1 });
    expect(page.result?.structuredContent).toMatchObject({ pagina: 1, limite: 1, hayMas: true });
    expect(JSON.stringify(byName)).not.toMatch(/password|token|sessionVersion|mcpIdentity|subject|oauth/i);
    expect(errorCode(await call("collaborator", "consultar_usuarios", { texto: "mcp" }))).toBe("FORBIDDEN");
  });

  it("crea el primer vínculo con email verificado y luego usa provider + subject", async () => {
    const suffix = crypto.randomUUID();
    const email = `mcp-autolink-${suffix}@test.local`;
    const user = await prisma.appUser.create({
      data: {
        name: `mcp-autolink-${suffix}`,
        email,
        passwordHash: "test",
        role: "COLLABORATOR",
        isActive: true,
      },
    });

    try {
      const actor = await resolveMcpActorFromClaims({
        provider,
        subject: `autolink-${suffix}`,
        email: email.toUpperCase(),
        emailVerified: true,
      });
      expect(actor.id).toBe(user.id);
      await expect(prisma.mcpIdentity.findUniqueOrThrow({
        where: { provider_subject: { provider, subject: `autolink-${suffix}` } },
      })).resolves.toMatchObject({ appUserId: user.id, emailSnapshot: email });

      await prisma.appUser.update({ where: { id: user.id }, data: { email: `changed-${email}` } });
      await expect(resolveMcpActorFromClaims({
        provider,
        subject: `autolink-${suffix}`,
      })).resolves.toMatchObject({ id: user.id });
    } finally {
      await prisma.mcpIdentity.deleteMany({ where: { appUserId: user.id } });
      await prisma.appUser.deleteMany({ where: { id: user.id } });
    }
  });

  it("distingue verificación pendiente de ausencia de AppUser", async () => {
    const inactive = await prisma.appUser.findUniqueOrThrow({ where: { id: inactiveId } });
    await expect(resolveMcpActorFromClaims({ provider, subject: "missing-email" })).rejects.toMatchObject({ code: "APP_USER_REQUIRED" });
    await expect(resolveMcpActorFromClaims({ provider, subject: "unverified-active", email: (await prisma.appUser.findUniqueOrThrow({ where: { id: collaboratorId } })).email, emailVerified: false })).rejects.toMatchObject({ code: "EMAIL_VERIFICATION_REQUIRED" });
    await expect(resolveMcpActorFromClaims({ provider, subject: "unverified-email", email: inactive.email, emailVerified: false })).rejects.toMatchObject({ code: "EMAIL_VERIFICATION_REQUIRED" });
    await expect(resolveMcpActorFromClaims({ provider, subject: "inactive-email", email: inactive.email, emailVerified: true })).rejects.toMatchObject({ code: "APP_USER_REQUIRED" });
  });

  it("mantiene el vínculo por subject aunque el token posterior no verifique el email", async () => {
    await expect(resolveMcpActorFromClaims({ provider, subject: "collaborator", email: "otro@example.test", emailVerified: false })).resolves.toMatchObject({ id: collaboratorId });
  });

  it("revalida rol actual sin relink", async () => {
    expect(errorCode(await call("admin", "consultar_ingresos", {}))).toBeUndefined();
    await prisma.appUser.update({ where: { id: adminId }, data: { role: "COLLABORATOR" } });
    expect(errorCode(await call("admin", "consultar_ingresos", {}))).toBe("FORBIDDEN");
    await prisma.appUser.update({ where: { id: adminId }, data: { role: "ADMIN" } });
  });

  it("limita tareas y mutaciones del colaborador a su propio scope", async () => {
    const tasks = await call("collaborator", "consultar_tareas_operativas", {});
    expect(tasks.result?.structuredContent.tareas.map((task: { id: string }) => task.id)).toEqual([ownTask]);
    const foreign = await prisma.operationalTask.findUniqueOrThrow({ where: { id: foreignTask } });
    expect(errorCode(await call("collaborator", "cambiar_estado_tarea_operativa", { taskId: foreignTask, estado: "DONE", expectedUpdatedAt: foreign.updatedAt.toISOString() }))).toBe("VALIDATION_ERROR");
    const created = await call("collaborator", "crear_tarea_operativa", { titulo: "Forzada propia", assigneeId: otherId });
    const createdId = created.result?.structuredContent.tarea.id;
    expect((await prisma.operationalTask.findUniqueOrThrow({ where: { id: createdId } })).assigneeId).toBe(collaboratorId);
    await prisma.operationalTask.delete({ where: { id: createdId } });
  });

  it("respeta el acceso a proyectos, ownership de tarea y usuario derivado al registrar tiempo", async () => {
    const deniedProject = await call("collaborator", "registrar_tiempo", { projectId: projectB, fecha: "2026-10-01", hours: 1, idempotencyKey: crypto.randomUUID(), descripcion: "Sin asignación", userId: otherId });
    expect(errorCode(deniedProject)).toBe("VALIDATION_ERROR");
    const deniedTask = await call("collaborator", "registrar_tiempo", { operationalTaskId: foreignTask, fecha: "2026-10-01", minutes: 30, idempotencyKey: crypto.randomUUID() });
    expect(errorCode(deniedTask)).toBe("VALIDATION_ERROR");
    const saved = await call("collaborator", "registrar_tiempo", { operationalTaskId: ownTask, fecha: "2026-10-01", hours: 1, minutes: 30, idempotencyKey: crypto.randomUUID(), detalle: "MCP" });
    const id = saved.result?.structuredContent.tiempo.id;
    const entry = await prisma.timeEntry.findUniqueOrThrow({ where: { id } });
    expect(entry.userId).toBe(collaboratorId);
    expect(entry.minutes).toBe(90);
    expect(entry.operationalTaskId).toBe(ownTask);
    expect(entry.description).toBe("Propia — MCP");
  });

  it("no expone finanzas, detalle financiero ni planificación al colaborador", async () => {
    for (const [name, args] of [
      ["consultar_ingresos", {}], ["consultar_gastos", {}], ["flujo_fondos", { desde: "2026-01-01", hasta: "2026-01-31" }], ["detalle_proyecto", { projectId: projectA }], ["planificacion_proyecto", { projectId: projectA }], ["crear_gasto", { concepto: "x", categoryId: "00000000-0000-4000-8000-000000000001", tipo: "FIXED", dinero: { moneda: "USD", monto: 1 }, situacion: { estado: "PENDING", vencimiento: "2026-10-01" } }],
    ] as const) {
      expect(errorCode(await call("collaborator", name, args))).toBe("FORBIDDEN");
    }
    const projects = await call("collaborator", "consultar_proyectos_operativos", {});
    expect(JSON.stringify(projects)).not.toMatch(/importe|monto|ingreso|gasto|rentabilidad/i);
    expect(projects.result?.structuredContent.proyectos).toHaveLength(1);
  });

  it("permite al ADMIN consultar scopes ajenos y conserva anulación lógica", async () => {
    const tasks = await call("admin", "consultar_tareas_operativas", { assigneeId: otherId });
    expect(tasks.result?.structuredContent.tareas.map((task: { id: string }) => task.id)).toContain(foreignTask);
    const time = await call("admin", "registrar_tiempo", { projectId: projectB, userId: otherId, fecha: "2026-10-01", minutes: 45, descripcion: "Admin", idempotencyKey: crypto.randomUUID() });
    const id = time.result?.structuredContent.tiempo.id;
    const listed = await call("admin", "consultar_tiempos", { userId: otherId, desde: "2026-10-01", hasta: "2026-10-01" });
    expect(listed.result?.structuredContent.tiempos.map((entry: { id: string }) => entry.id)).toContain(id);
    expect((await call("admin", "anular_tiempo", { timeEntryId: id, motivo: "Corrección" })).result?.structuredContent.tiempo.estado).toBe("VOID");
  });

  it("evita auto-vínculos ambiguos y corta acceso después de desactivar", async () => {
    await expect(resolveMcpActorFromClaims({ provider, subject: "second-subject", email: (await prisma.appUser.findUniqueOrThrow({ where: { id: otherId } })).email, emailVerified: true })).rejects.toMatchObject({ code: "APP_USER_REQUIRED" });
    await expect(resolveMcpActorFromClaims({ provider, subject: "collaborator", email: (await prisma.appUser.findUniqueOrThrow({ where: { id: otherId } })).email, emailVerified: true })).resolves.toMatchObject({ id: collaboratorId });
    await prisma.appUser.update({ where: { id: collaboratorId }, data: { isActive: false } });
    expect(errorCode(await call("collaborator", "consultar_tiempos", {}))).toBe("APP_USER_INACTIVE");
    await prisma.appUser.update({ where: { id: collaboratorId }, data: { isActive: true } });
  });
});
