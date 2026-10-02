import "server-only";
import { Prisma, type OperationalTaskStatus } from "@prisma/client";
import { z } from "zod";
import { isValidCalendarDateKey, todayKeyArgentina, toUtcDate } from "@/lib/dates";
import type { CurrentUser } from "@/lib/auth";
import { prisma } from "@/server/prisma";

export const OPERATIONAL_TASK_STATUSES = ["PENDING", "IN_PROGRESS", "BLOCKED", "DONE"] as const;
export type OperationalTaskDueFilter = "ALL" | "OVERDUE" | "TODAY" | "NEXT_7_DAYS" | "NO_DUE";
export type OperationalTaskSort =
  | "due-asc"
  | "due-desc"
  | "created-asc"
  | "created-desc"
  | "updated-asc"
  | "updated-desc"
  | "status-asc"
  | "status-desc"
  | "assignee-asc"
  | "assignee-desc";

const uuid = z.string().uuid("Identificador inválido.");
const dateOnly = z.string().refine(isValidCalendarDateKey, "Fecha inválida.");
const title = z.string().trim().min(1, "El título es obligatorio.").max(300, "El título es demasiado largo.");
const description = z.string().trim().max(10_000, "La descripción es demasiado larga.").nullable().optional();
const blockedReason = z.string().trim().min(1, "Indicá qué necesitás para continuar.").max(4_000, "El motivo es demasiado largo.");

export const operationalTaskCreateSchema = z.object({
  title,
  description,
  assigneeId: uuid.optional(),
  projectId: uuid.nullable().optional(),
  dueDate: dateOnly.nullable().optional(),
}).strict();

export const operationalTaskUpdateSchema = z.object({
  title: title.optional(),
  description,
  assigneeId: uuid.optional(),
  projectId: uuid.nullable().optional(),
  dueDate: dateOnly.nullable().optional(),
  expectedUpdatedAt: z.string().datetime(),
}).strict();

export const operationalTaskStatusSchema = z.object({
  status: z.enum(OPERATIONAL_TASK_STATUSES),
  blockedReason: z.string().trim().max(4_000, "El motivo es demasiado largo.").nullable().optional(),
  expectedUpdatedAt: z.string().datetime(),
}).strict().superRefine((input, context) => {
  if (input.status === "BLOCKED") {
    const result = blockedReason.safeParse(input.blockedReason);
    if (!result.success) {
      context.addIssue({ code: "custom", path: ["blockedReason"], message: "Indicá qué necesitás para continuar." });
    }
  }
});

export type OperationalTaskCreateInput = z.infer<typeof operationalTaskCreateSchema>;
export type OperationalTaskUpdateInput = z.infer<typeof operationalTaskUpdateSchema>;

export type OperationalTaskFilters = {
  search?: string;
  status?: OperationalTaskStatus;
  assigneeId?: string;
  clientId?: string;
  projectId?: string;
  due?: OperationalTaskDueFilter;
  sort?: OperationalTaskSort;
};

const taskSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  creatorId: true,
  assigneeId: true,
  projectId: true,
  dueDate: true,
  blockedReason: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  creator: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, isActive: true } },
  project: { select: { id: true, name: true, isActive: true, client: { select: { id: true, name: true } } } },
} satisfies Prisma.OperationalTaskSelect;

function actorScope(actor: CurrentUser): Prisma.OperationalTaskWhereInput {
  return actor.role === "ADMIN" ? {} : { assigneeId: actor.id };
}

function dueWhere(filter: OperationalTaskDueFilter | undefined, todayKey = todayKeyArgentina()): Prisma.OperationalTaskWhereInput {
  if (!filter || filter === "ALL") return {};
  const today = toUtcDate(todayKey);
  if (filter === "OVERDUE") return { dueDate: { lt: today }, status: { not: "DONE" } };
  if (filter === "TODAY") return { dueDate: today };
  if (filter === "NO_DUE") return { dueDate: null };
  const end = new Date(today.getTime() + 7 * 86_400_000);
  return { dueDate: { gte: today, lte: end }, status: { not: "DONE" } };
}

function orderBy(sort: OperationalTaskSort | undefined): Prisma.OperationalTaskOrderByWithRelationInput[] {
  const direction = sort?.endsWith("-asc") ? "asc" : "desc";
  if (sort?.startsWith("due-")) return [{ dueDate: { sort: direction, nulls: "last" } }, { updatedAt: "desc" }];
  if (sort?.startsWith("created-")) return [{ createdAt: direction }, { id: "asc" }];
  if (sort?.startsWith("updated-")) return [{ updatedAt: direction }, { id: "asc" }];
  if (sort?.startsWith("status-")) return [{ status: direction }, { dueDate: { sort: "asc", nulls: "last" } }];
  if (sort?.startsWith("assignee-")) return [{ assignee: { name: direction } }, { dueDate: { sort: "asc", nulls: "last" } }];
  return [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }];
}

export async function listOperationalTasks(actor: CurrentUser, filters: OperationalTaskFilters = {}) {
  const search = filters.search?.trim();
  const tasks = await prisma.operationalTask.findMany({
    where: {
      ...actorScope(actor),
      ...dueWhere(filters.due),
      ...(filters.status ? { status: filters.status } : {}),
      ...(actor.role === "ADMIN" && filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.clientId ? { project: { clientId: filters.clientId } } : {}),
      ...(search ? { OR: [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { blockedReason: { contains: search, mode: "insensitive" } },
      ] } : {}),
    },
    select: {
      ...taskSelect,
      timeEntries: {
        where: actor.role === "COLLABORATOR" ? { userId: actor.id } : {},
        orderBy: [{ workDate: "desc" as const }, { createdAt: "desc" as const }],
        take: 10,
        select: {
          id: true, userId: true, workDate: true, minutes: true, description: true,
          status: true, voidReason: true, updatedAt: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: orderBy(filters.sort),
  });
  const ids = tasks.map((task) => task.id);
  if (ids.length === 0) return [];
  const totals = await prisma.timeEntry.groupBy({
    by: ["operationalTaskId"],
    where: {
      operationalTaskId: { in: ids },
      status: "ACTIVE",
      ...(actor.role === "COLLABORATOR" ? { userId: actor.id } : {}),
    },
    _sum: { minutes: true },
  });
  const totalByTask = new Map(totals.map((row) => [row.operationalTaskId, row._sum.minutes ?? 0]));
  return tasks.map((task) => ({ ...task, timeMinutes: totalByTask.get(task.id) ?? 0 }));
}

export async function getOperationalTask(actor: CurrentUser, id: string) {
  const task = await prisma.operationalTask.findFirst({
    where: { id: uuid.parse(id), ...actorScope(actor) },
    select: taskSelect,
  });
  if (!task) throw new Error("Tarea no encontrada.");
  return task;
}

export async function getOperationalTaskIndicators(actor: CurrentUser) {
  const scope = actorScope(actor);
  const today = toUtcDate(todayKeyArgentina());
  const [pending, inProgress, blocked, overdue, done] = await Promise.all([
    prisma.operationalTask.count({ where: { ...scope, status: "PENDING" } }),
    prisma.operationalTask.count({ where: { ...scope, status: "IN_PROGRESS" } }),
    prisma.operationalTask.count({ where: { ...scope, status: "BLOCKED" } }),
    prisma.operationalTask.count({ where: { ...scope, dueDate: { lt: today }, status: { not: "DONE" } } }),
    prisma.operationalTask.count({ where: { ...scope, status: "DONE" } }),
  ]);
  return { pending, inProgress, blocked, overdue, done };
}

export async function listOperationalTaskProjectOptions(actor: CurrentUser) {
  return prisma.project.findMany({
    where: actor.role === "ADMIN"
      ? { isActive: true }
      : { isActive: true, userProjectAccess: { some: { userId: actor.id } } },
    select: { id: true, name: true, client: { select: { id: true, name: true } } },
    orderBy: [{ client: { name: "asc" } }, { name: "asc" }, { id: "asc" }],
  });
}

export async function listOperationalTaskAssignees(actor: CurrentUser) {
  if (actor.role !== "ADMIN") return [];
  return prisma.appUser.findMany({
    where: { isActive: true },
    select: { id: true, name: true, role: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}

async function assertAssignee(actor: CurrentUser, assigneeId: string, tx: Prisma.TransactionClient) {
  if (actor.role !== "ADMIN" && assigneeId !== actor.id) throw new Error("No podés asignar tareas a otra persona.");
  const assignee = await tx.appUser.findUnique({ where: { id: assigneeId }, select: { id: true, isActive: true } });
  if (!assignee?.isActive) throw new Error("La persona responsable no está activa.");
}

async function assertProjectAccess(actor: CurrentUser, projectId: string, tx: Prisma.TransactionClient) {
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true, isActive: true } });
  if (!project) throw new Error("Proyecto inexistente.");
  if (!project.isActive) throw new Error("Sólo se pueden usar proyectos activos.");
  if (actor.role === "COLLABORATOR") {
    const assignment = await tx.userProjectAccess.findUnique({ where: { userId_projectId: { userId: actor.id, projectId } }, select: { id: true } });
    if (!assignment) throw new Error("No tenés autorización para usar este proyecto.");
  }
}

export async function createOperationalTask(actor: CurrentUser, raw: OperationalTaskCreateInput) {
  const input = operationalTaskCreateSchema.parse(raw);
  const assigneeId = actor.role === "ADMIN" ? input.assigneeId ?? actor.id : actor.id;
  return prisma.$transaction(async (tx) => {
    await assertAssignee(actor, assigneeId, tx);
    if (input.projectId) await assertProjectAccess(actor, input.projectId, tx);
    return tx.operationalTask.create({
      data: {
        title: input.title,
        description: input.description?.trim() || null,
        creatorId: actor.id,
        assigneeId,
        projectId: input.projectId ?? null,
        dueDate: input.dueDate ? toUtcDate(input.dueDate) : null,
      },
      select: taskSelect,
    });
  });
}

export async function updateOperationalTask(actor: CurrentUser, id: string, raw: OperationalTaskUpdateInput) {
  const taskId = uuid.parse(id);
  const input = operationalTaskUpdateSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const current = await tx.operationalTask.findFirst({
      where: { id: taskId, ...actorScope(actor) },
      select: { id: true, assigneeId: true, updatedAt: true },
    });
    if (!current) throw new Error("Tarea no encontrada.");
    const expected = new Date(input.expectedUpdatedAt);
    if (current.updatedAt.getTime() !== expected.getTime()) throw new Error("La tarea cambió; actualizá la lista antes de guardar.");

    if (input.assigneeId !== undefined) {
      if (actor.role !== "ADMIN") throw new Error("No podés reasignar tareas.");
      await assertAssignee(actor, input.assigneeId, tx);
    }
    if (input.projectId !== undefined && input.projectId !== null) await assertProjectAccess(actor, input.projectId, tx);

    const changed = await tx.operationalTask.updateMany({
      where: { id: taskId, updatedAt: current.updatedAt, ...actorScope(actor) },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
        ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? toUtcDate(input.dueDate) : null } : {}),
      },
    });
    if (changed.count !== 1) throw new Error("La tarea cambió; actualizá la lista antes de guardar.");
    return tx.operationalTask.findUniqueOrThrow({ where: { id: taskId }, select: taskSelect });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function changeOperationalTaskStatus(
  actor: CurrentUser,
  id: string,
  raw: z.input<typeof operationalTaskStatusSchema>,
) {
  const taskId = uuid.parse(id);
  const input = operationalTaskStatusSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const current = await tx.operationalTask.findFirst({
      where: { id: taskId, ...actorScope(actor) },
      select: { id: true, status: true, updatedAt: true, completedAt: true },
    });
    if (!current) throw new Error("Tarea no encontrada.");
    const expected = new Date(input.expectedUpdatedAt);
    if (current.updatedAt.getTime() !== expected.getTime()) throw new Error("La tarea cambió; actualizá la lista antes de guardar.");
    const justCompleted = current.status !== "DONE" && input.status === "DONE";
    const changed = await tx.operationalTask.updateMany({
      where: { id: taskId, updatedAt: current.updatedAt, ...actorScope(actor) },
      data: {
        status: input.status,
        ...(input.status === "BLOCKED" ? { blockedReason: input.blockedReason!.trim() } : {}),
        completedAt: input.status === "DONE" ? current.completedAt ?? new Date() : null,
      },
    });
    if (changed.count !== 1) throw new Error("La tarea cambió; actualizá la lista antes de guardar.");
    const task = await tx.operationalTask.findUniqueOrThrow({ where: { id: taskId }, select: taskSelect });
    return { task, justCompleted };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
