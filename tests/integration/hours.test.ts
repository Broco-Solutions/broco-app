import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/prisma";
import { createTimeEntry, createTimeEntryForOperationalTask, getHourReport, listTimeEntries, updateTimeEntry, voidTimeEntry } from "@/server/services/hours";
import { createOperationalTask, listOperationalTasks } from "@/server/services/operational-tasks";
import { deleteProject } from "@/server/services/projects";
import { todayKeyArgentina, toUtcDate } from "@/lib/dates";
import type { CurrentUser } from "@/lib/auth";

const testDb = process.env.DATABASE_URL_TEST;
const suite = testDb ? describe : describe.skip;
const today = todayKeyArgentina();
const future = new Date(toUtcDate(today).getTime() + 86400000).toISOString().slice(0, 10);
const previousDay = new Date(toUtcDate(today).getTime() - 86400000).toISOString().slice(0, 10);
let admin: CurrentUser; let collaboratorA: CurrentUser; let collaboratorB: CurrentUser; let projectA = ""; let projectB = "";

suite("Horas V1", () => {
  beforeAll(async () => {
    const users = await prisma.appUser.findMany({ where: { email: { in: ["admin@test.local", "dev-a@test.local", "dev-b@test.local"] } }, select: { id: true, name: true, email: true, role: true, sessionVersion: true } });
    const byEmail = new Map(users.map((user) => [user.email, user]));
    const a = byEmail.get("admin@test.local"); const ca = byEmail.get("dev-a@test.local"); const cb = byEmail.get("dev-b@test.local");
    if (!a || !ca || !cb) throw new Error("Ejecutar seed:hours:test antes de este suite.");
    admin = a; collaboratorA = ca; collaboratorB = cb;
    projectA = (await prisma.project.findFirstOrThrow({ where: { name: "Horas Test Proyecto A1" } })).id;
    projectB = (await prisma.project.findFirstOrThrow({ where: { name: "Horas Test Proyecto B1" } })).id;
    await prisma.timeEntry.deleteMany({ where: { userId: { in: [a.id, ca.id, cb.id] } } });
  });
  afterAll(async () => {
    await prisma.timeEntry.deleteMany({ where: { userId: { in: [admin.id, collaboratorA.id, collaboratorB.id] } } });
    await prisma.operationalTask.deleteMany({ where: { creatorId: { in: [admin.id, collaboratorA.id, collaboratorB.id] } } });
  });

  it("normaliza minutos, coma/punto y permite reintento idempotente", async () => {
    const operationId = crypto.randomUUID();
    const first = await createTimeEntry(collaboratorA, { userId: collaboratorA.id, projectId: projectA, workDate: today, minutes: 45, description: "Carga 45", referenceUrl: null, idempotencyKey: operationId });
    const retry = await createTimeEntry(collaboratorA, { userId: collaboratorA.id, projectId: projectA, workDate: today, minutes: 45, description: "Carga 45", referenceUrl: null, idempotencyKey: operationId });
    expect(retry.id).toBe(first.id);
    await createTimeEntry(collaboratorA, { userId: collaboratorA.id, projectId: projectA, workDate: today, minutes: 90, description: "Carga 1,5", referenceUrl: null, idempotencyKey: crypto.randomUUID() });
    const report = await getHourReport(collaboratorA, { from: today, to: today });
    expect(report.kpis.minutes).toBe(135);
  });

  it("aplica scope por usuario/proyecto y no confía en userId", async () => {
    await expect(createTimeEntry(collaboratorA, { userId: collaboratorB.id, projectId: projectB, workDate: today, minutes: 10, description: "IDOR", referenceUrl: null, idempotencyKey: crypto.randomUUID() })).rejects.toThrow();
    await expect(createTimeEntry(collaboratorA, { userId: collaboratorA.id, projectId: projectB, workDate: today, minutes: 10, description: "Proyecto no asignado", referenceUrl: null, idempotencyKey: crypto.randomUUID() })).rejects.toThrow();
    const own = await listTimeEntries(collaboratorA, { from: today, to: today, userId: collaboratorB.id });
    expect(own.every((entry) => entry.userId === collaboratorA.id)).toBe(true);
  });

  it("rechaza futuro, mantiene el máximo diario y permite varios registros", async () => {
    await expect(createTimeEntry(collaboratorB, { userId: collaboratorB.id, projectId: projectB, workDate: future, minutes: 1, description: "Futuro", referenceUrl: null, idempotencyKey: crypto.randomUUID() })).rejects.toThrow("futuras");
    await createTimeEntry(collaboratorB, { userId: collaboratorB.id, projectId: projectB, workDate: today, minutes: 1440, description: "Máximo", referenceUrl: null, idempotencyKey: crypto.randomUUID() });
    await expect(createTimeEntry(collaboratorB, { userId: collaboratorB.id, projectId: projectB, workDate: today, minutes: 1, description: "Exceso", referenceUrl: null, idempotencyKey: crypto.randomUUID() })).rejects.toThrow("24 horas");
  });

  it("anula fuera de totales y exige motivo para corregir un registro ajeno", async () => {
    const entry = await createTimeEntry(collaboratorA, { userId: collaboratorA.id, projectId: projectA, workDate: today, minutes: 20, description: "Para auditar", referenceUrl: null, idempotencyKey: crypto.randomUUID() });
    await expect(updateTimeEntry(admin, entry.id, { projectId: projectA, workDate: today, minutes: 30, description: "Corregido", referenceUrl: null }, "", "")).rejects.toThrow("motivo");
    await expect(updateTimeEntry(admin, entry.id, { projectId: projectA, workDate: today, minutes: 30, description: "Corregido", referenceUrl: null }, "Corrección administrativa", "")).rejects.toThrow("versión");
    const current = await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id }, select: { updatedAt: true } });
    await updateTimeEntry(admin, entry.id, { projectId: projectA, workDate: today, minutes: 30, description: "Corregido", referenceUrl: null }, "Corrección administrativa", current.updatedAt.toISOString());
    await voidTimeEntry(admin, entry.id, "Carga duplicada");
    const report = await getHourReport(admin, { from: today, to: today, userId: collaboratorA.id });
    expect(report.entries.some((item) => item.id === entry.id && item.status === "VOID")).toBe(true);
    expect(report.kpis.minutes).toBe(135);
    const audits = await prisma.timeEntryAudit.findMany({ where: { entryId: entry.id }, orderBy: { createdAt: "asc" } });
    expect(audits.map((audit) => audit.action)).toEqual(["CREATED", "UPDATED", "VOIDED"]);
    expect(audits[1].reason).toBe("Corrección administrativa");
  });

  it("protege la eliminación del proyecto con horas, incluso anuladas", async () => {
    await expect(deleteProject(projectA)).rejects.toThrow("movimientos asociados");
  });

  it("permite al ADMIN cargar para sí mismo en proyectos activos y rechaza proyectos inactivos", async () => {
    const own = await createTimeEntry(admin, { userId: admin.id, projectId: projectA, workDate: today, minutes: 15, description: "Carga propia admin", referenceUrl: null, idempotencyKey: crypto.randomUUID() });
    expect(own.userId).toBe(admin.id);
    await prisma.project.update({ where: { id: projectA }, data: { isActive: false } });
    try {
      await expect(createTimeEntry(admin, { userId: collaboratorA.id, projectId: projectA, workDate: today, minutes: 15, description: "Inactivo", referenceUrl: null, idempotencyKey: crypto.randomUUID() })).rejects.toThrow("inactivo");
    } finally {
      await prisma.project.update({ where: { id: projectA }, data: { isActive: true } });
    }
  });

  it("rechaza fechas de calendario inválidas e idempotency keys con payload distinto", async () => {
    await expect(createTimeEntry(collaboratorA, { userId: collaboratorA.id, projectId: projectA, workDate: "2026-02-30", minutes: 15, description: "Fecha inválida", referenceUrl: null, idempotencyKey: crypto.randomUUID() })).rejects.toThrow("Fecha inválida");
    const key = crypto.randomUUID();
    await createTimeEntry(collaboratorA, { userId: collaboratorA.id, projectId: projectA, workDate: today, minutes: 15, description: "Idempotente", referenceUrl: "https://example.test/a", idempotencyKey: key });
    await expect(createTimeEntry(collaboratorA, { userId: collaboratorA.id, projectId: projectA, workDate: today, minutes: 15, description: "Idempotente", referenceUrl: "https://example.test/b", idempotencyKey: key })).rejects.toThrow("otros datos");
  });

  it("detecta una corrección concurrente sobre una versión anterior", async () => {
    const entry = await createTimeEntry(collaboratorA, { userId: collaboratorA.id, projectId: projectA, workDate: today, minutes: 20, description: "Conflicto", referenceUrl: null, idempotencyKey: crypto.randomUUID() });
    const version = (await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id } })).updatedAt.toISOString();
    const input = { projectId: projectA, workDate: today, minutes: 25, description: "Corrección concurrente", referenceUrl: null };
    const results = await Promise.allSettled([
      updateTimeEntry(admin, entry.id, input, "Corrección administrativa", version),
      updateTimeEntry(admin, entry.id, { ...input, minutes: 30 }, "Corrección administrativa", version),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("registra tiempo real desde una tarea sin pedir otra descripción", async () => {
    const task = await createOperationalTask(collaboratorA, { title: "Revisar proveedores", projectId: projectA });
    const entry = await createTimeEntryForOperationalTask(collaboratorA, {
      taskId: task.id,
      workDate: previousDay,
      minutes: 70,
      additionalDetail: "Validación de CUIT",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(entry.operationalTaskId).toBe(task.id);
    expect(entry.userId).toBe(collaboratorA.id);
    expect(entry.projectId).toBe(projectA);
    expect(entry.description).toBe("Revisar proveedores — Validación de CUIT");

    const filtered = await listTimeEntries(collaboratorA, { from: previousDay, to: previousDay, operationalTaskId: task.id });
    expect(filtered.map((item) => item.id)).toContain(entry.id);
    const taskWithTime = (await listOperationalTasks(collaboratorA)).find((item) => item.id === task.id);
    expect(taskWithTime?.timeMinutes).toBe(70);
  });

  it("protege tarea, usuario y proyecto en la carga rápida", async () => {
    const assigned = await createOperationalTask(admin, { title: "Tarea de B", assigneeId: collaboratorB.id, projectId: projectB });
    await expect(createTimeEntryForOperationalTask(collaboratorA, {
      taskId: assigned.id, workDate: previousDay, minutes: 15, additionalDetail: null, idempotencyKey: crypto.randomUUID(),
    })).rejects.toThrow("no encontrada");

    const general = await createOperationalTask(collaboratorA, { title: "Tarea general" });
    await expect(createTimeEntryForOperationalTask(collaboratorA, {
      taskId: general.id, workDate: previousDay, minutes: 15, additionalDetail: null, idempotencyKey: crypto.randomUUID(),
    })).rejects.toThrow("proyecto");

    const adminEntry = await createTimeEntryForOperationalTask(admin, {
      taskId: assigned.id, workDate: previousDay, minutes: 20, additionalDetail: null, idempotencyKey: crypto.randomUUID(),
    });
    expect(adminEntry.userId).toBe(collaboratorB.id);
    expect(adminEntry.createdAt).toBeInstanceOf(Date);
  });

  it("excluye anulados del total de la tarea y conserva la auditoría existente", async () => {
    const task = await createOperationalTask(collaboratorA, { title: "Tiempo anulable", projectId: projectA });
    const entry = await createTimeEntryForOperationalTask(collaboratorA, {
      taskId: task.id, workDate: previousDay, minutes: 35, additionalDetail: null, idempotencyKey: crypto.randomUUID(),
    });
    await voidTimeEntry(collaboratorA, entry.id, "Carga incorrecta");
    const refreshed = (await listOperationalTasks(collaboratorA)).find((item) => item.id === task.id);
    expect(refreshed?.timeMinutes).toBe(0);
    expect(refreshed?.timeEntries.find((item) => item.id === entry.id)?.status).toBe("VOID");
    expect(await prisma.timeEntryAudit.count({ where: { entryId: entry.id } })).toBe(2);
  });
});
