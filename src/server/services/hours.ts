import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/prisma";
import { type CurrentUser } from "@/lib/auth";
import { isValidCalendarDateKey, todayKeyArgentina, toUtcDate } from "@/lib/dates";

const dateSchema = z.string().refine(isValidCalendarDateKey, "Fecha inválida.");
const entrySchema = z.object({
  userId: z.string().uuid(), projectId: z.string().uuid(), workDate: dateSchema,
  minutes: z.number().int().positive().max(1440), description: z.string().trim().min(1, "La descripción es obligatoria.").max(2000), idempotencyKey: z.string().uuid(),
  referenceUrl: z.string().trim().url("El enlace no es válido.").max(2000).nullable().optional(),
});
export type TimeEntryInput = z.infer<typeof entrySchema>;

function utcDate(value: string) { return toUtcDate(value); }
function assertDate(value: string) { if (value > todayKeyArgentina()) throw new Error("No se pueden cargar fechas futuras."); }
function canManage(user: CurrentUser, targetUserId: string) { return user.role === "ADMIN" || user.id === targetUserId; }
function auditJson(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }

async function assertProjectScope(actor: CurrentUser, userId: string, projectId: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, isActive: true, client: { select: { id: true, name: true } } } });
  if (!project) throw new Error("Proyecto inexistente.");
  if (!project.isActive) throw new Error("No se pueden cargar horas en un proyecto inactivo.");
  if (actor.role === "ADMIN") return project;
  const assigned = await tx.hourAssignment.findUnique({ where: { userId_projectId: { userId, projectId } } });
  if (!assigned || !project.isActive) throw new Error("La persona no tiene autorización para cargar en este proyecto activo.");
  return project;
}

export async function listHourOptions(actor: CurrentUser, userId = actor.id) {
  if (actor.role !== "ADMIN" && userId !== actor.id) throw new Error("No autorizado.");
  const where = actor.role === "ADMIN" ? { isActive: true } : { isActive: true, hourAssignments: { some: { userId } } };
  return prisma.project.findMany({ where, select: { id: true, name: true, client: { select: { id: true, name: true } } }, orderBy: [{ client: { name: "asc" } }, { name: "asc" }] });
}

export async function createTimeEntry(actor: CurrentUser, raw: TimeEntryInput) {
  const input = entrySchema.parse(raw);
  if (!canManage(actor, input.userId)) throw new Error("No podés registrar horas para otra persona.");
  assertDate(input.workDate);
  const target = await prisma.appUser.findUnique({ where: { id: input.userId }, select: { id: true, isActive: true } });
  if (!target?.isActive) throw new Error("La persona está desactivada.");
  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${input.userId}:${input.workDate}`}))`;
    const existing = await tx.timeEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, userId: true, projectId: true, workDate: true, minutes: true, description: true, referenceUrl: true, status: true, createdAt: true, project: { select: { name: true, client: { select: { name: true } } } } } });
    if (existing) {
      if (
        existing.userId !== input.userId ||
        existing.projectId !== input.projectId ||
        existing.workDate.toISOString().slice(0, 10) !== input.workDate ||
        existing.minutes !== input.minutes ||
        existing.description !== input.description ||
        (existing.referenceUrl ?? null) !== (input.referenceUrl ?? null)
      ) throw new Error("La operación ya fue utilizada con otros datos.");
      return { ...existing, projectName: existing.project.name, clientName: existing.project.client.name };
    }
    const project = await assertProjectScope(actor, input.userId, input.projectId, tx);
    const aggregate = await tx.timeEntry.aggregate({ where: { userId: input.userId, workDate: utcDate(input.workDate), status: "ACTIVE" }, _sum: { minutes: true } });
    if ((aggregate._sum.minutes ?? 0) + input.minutes > 1440) throw new Error("El total diario no puede superar 24 horas.");
    const entry = await tx.timeEntry.create({ data: { userId: input.userId, projectId: input.projectId, workDate: utcDate(input.workDate), minutes: input.minutes, description: input.description, referenceUrl: input.referenceUrl || null, idempotencyKey: input.idempotencyKey, createdById: actor.id }, select: { id: true, userId: true, projectId: true, workDate: true, minutes: true, description: true, referenceUrl: true, status: true, createdAt: true, project: { select: { name: true, client: { select: { name: true } } } } } });
    await tx.timeEntryAudit.create({ data: { entryId: entry.id, actorId: actor.id, action: "CREATED", afterJson: auditJson(entry) } });
    return { ...entry, projectName: project.name, clientName: project.client.name };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return created;
}

export type HourFilters = { from: string; to: string; clientId?: string; projectId?: string; userId?: string };
export async function listTimeEntries(actor: CurrentUser, filters: HourFilters) {
  const where = { workDate: { gte: utcDate(filters.from), lte: utcDate(filters.to) }, ...(filters.clientId ? { project: { clientId: filters.clientId } } : {}), ...(filters.projectId ? { projectId: filters.projectId } : {}), ...(actor.role === "ADMIN" && filters.userId ? { userId: filters.userId } : actor.role === "COLLABORATOR" ? { userId: actor.id } : {}) };
  return prisma.timeEntry.findMany({ where, orderBy: [{ workDate: "desc" }, { createdAt: "desc" }], select: { id: true, userId: true, projectId: true, workDate: true, minutes: true, description: true, referenceUrl: true, status: true, createdAt: true, updatedAt: true, user: { select: { name: true, email: true } }, project: { select: { name: true, client: { select: { id: true, name: true } } } } } });
}

export async function getHourReport(actor: CurrentUser, filters: HourFilters) {
  const entries = await listTimeEntries(actor, filters);
  const active = entries.filter((entry) => entry.status === "ACTIVE");
  const byClientProject = new Map<string, { clientName: string; projectName: string; minutes: number; entries: number }>();
  const byUser = new Map<string, { userName: string; minutes: number; entries: number }>();
  for (const entry of active) {
    const cpKey = `${entry.project.client.id}:${entry.projectId}`;
    const cp = byClientProject.get(cpKey) ?? { clientName: entry.project.client.name, projectName: entry.project.name, minutes: 0, entries: 0 };
    cp.minutes += entry.minutes; cp.entries += 1; byClientProject.set(cpKey, cp);
    const u = byUser.get(entry.userId) ?? { userName: entry.user.name, minutes: 0, entries: 0 };
    u.minutes += entry.minutes; u.entries += 1; byUser.set(entry.userId, u);
  }
  return { entries, kpis: { minutes: active.reduce((sum, e) => sum + e.minutes, 0), days: new Set(active.map((e) => e.workDate.toISOString().slice(0, 10))).size, projects: new Set(active.map((e) => e.projectId)).size, users: new Set(active.map((e) => e.userId)).size }, byClientProject: [...byClientProject.values()], byUser: [...byUser.values()] };
}

export async function voidTimeEntry(actor: CurrentUser, id: string, reason: string) {
  if (!reason.trim()) throw new Error("El motivo es obligatorio.");
  const entry = await prisma.timeEntry.findUnique({ where: { id }, select: { id: true, userId: true, projectId: true, workDate: true, minutes: true, description: true, referenceUrl: true, status: true, createdById: true, modifiedById: true, voidReason: true, createdAt: true, updatedAt: true, project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } } } });
  if (!entry || entry.status !== "ACTIVE") throw new Error("Registro inexistente o ya anulado.");
  if (actor.role !== "ADMIN" && entry.userId !== actor.id) throw new Error("No autorizado.");
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.timeEntry.updateMany({ where: { id, status: "ACTIVE" }, data: { status: "VOID", voidReason: reason.trim(), modifiedById: actor.id } });
    if (result.count !== 1) throw new Error("El registro cambió mientras se anulaba.");
    const after = await tx.timeEntry.findUniqueOrThrow({ where: { id } });
    await tx.timeEntryAudit.create({ data: { entryId: id, actorId: actor.id, action: "VOIDED", reason: reason.trim(), beforeJson: auditJson(entry), afterJson: auditJson(after) } });
    return after;
  });
  return updated;
}

export async function updateTimeEntry(actor: CurrentUser, id: string, input: Omit<TimeEntryInput, "userId" | "idempotencyKey">, reason: string, expectedUpdatedAt: string) {
  const parsed = entrySchema.omit({ userId: true, idempotencyKey: true }).parse(input);
  const current = await prisma.timeEntry.findUnique({ where: { id }, select: { id: true, userId: true, projectId: true, workDate: true, minutes: true, description: true, referenceUrl: true, status: true, createdById: true, modifiedById: true, voidReason: true, createdAt: true, updatedAt: true, project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } } } });
  if (!current || current.status !== "ACTIVE") throw new Error("Registro inexistente o anulado.");
  if (actor.role !== "ADMIN" && current.userId !== actor.id) throw new Error("No autorizado.");
  if (current.userId !== actor.id && !reason.trim()) throw new Error("El motivo es obligatorio para corregir un registro ajeno.");
  if (!expectedUpdatedAt) throw new Error("La corrección requiere una versión de la lista. Actualizá e intentá de nuevo.");
  const expected = new Date(expectedUpdatedAt);
  if (Number.isNaN(expected.getTime()) || current.updatedAt.getTime() !== expected.getTime()) throw new Error("El registro cambió; actualizá la lista antes de corregirlo.");
  assertDate(parsed.workDate);
  const updated = await prisma.$transaction(async (tx) => {
    const keys = [...new Set([current.workDate.toISOString().slice(0, 10), parsed.workDate])].sort();
    for (const key of keys) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${current.userId}:${key}`}))`;
    await assertProjectScope(actor, current.userId, parsed.projectId, tx);
    const aggregate = await tx.timeEntry.aggregate({ where: { id: { not: id }, userId: current.userId, workDate: utcDate(parsed.workDate), status: "ACTIVE" }, _sum: { minutes: true } });
    if ((aggregate._sum.minutes ?? 0) + parsed.minutes > 1440) throw new Error("El total diario no puede superar 24 horas.");
    const before = auditJson(current);
    const changed = await tx.timeEntry.updateMany({
      where: { id, status: "ACTIVE", updatedAt: current.updatedAt },
      data: { projectId: parsed.projectId, workDate: utcDate(parsed.workDate), minutes: parsed.minutes, description: parsed.description, referenceUrl: parsed.referenceUrl || null, modifiedById: actor.id },
    });
    if (changed.count !== 1) throw new Error("El registro cambió; actualizá la lista antes de corregirlo.");
    const after = await tx.timeEntry.findUniqueOrThrow({ where: { id } });
    await tx.timeEntryAudit.create({ data: { entryId: id, actorId: actor.id, action: "UPDATED", reason: reason.trim() || null, beforeJson: before, afterJson: auditJson(after) } });
    return after;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return updated;
}

export function formatMinutes(minutes: number) { const h = Math.floor(minutes / 60); const m = minutes % 60; return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`; }
