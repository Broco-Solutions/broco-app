import "server-only";
import { prisma } from "@/server/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export const TASK_TYPES = ["TASK", "MILESTONE"] as const;
export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "TO_REVIEW", "BLOCKED", "DONE"] as const;

export type ProjectTaskType = (typeof TASK_TYPES)[number];
export type ProjectTaskStatus = (typeof TASK_STATUSES)[number];

export const taskInputSchema = z.object({
  projectId: z.string().min(1, "El proyecto es obligatorio."),
  phaseId: z.string().nullable().optional(),
  name: z.string().trim().min(1, "El nombre de la tarea es obligatorio."),
  description: z.string().trim().nullable().optional(),
  type: z.enum(TASK_TYPES).optional(),
  startDate: z.string().min(1, "La fecha de inicio es obligatoria."),
  endDate: z.string().min(1, "La fecha de fin es obligatoria."),
  status: z.enum(TASK_STATUSES).optional(),
  position: z.number().int().optional(),
  clientVisible: z.boolean().optional(),
});

export type TaskInput = z.infer<typeof taskInputSchema>;

export const taskUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().nullable().optional(),
  type: z.enum(TASK_TYPES).optional(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
  position: z.number().int().optional(),
});

export type TaskUpdate = z.infer<typeof taskUpdateSchema>;

export function resolveTaskDates(
  type: ProjectTaskType,
  startDate: string,
  endDate: string,
): { startDate: Date; endDate: Date } {
  const start = new Date(startDate);
  if (isNaN(start.getTime())) throw new Error("Fecha de inicio inválida.");

  if (type === "MILESTONE") {
    return { startDate: start, endDate: start };
  }

  const end = new Date(endDate);
  if (isNaN(end.getTime())) throw new Error("Fecha de fin inválida.");
  if (start.getTime() > end.getTime()) {
    throw new Error("La fecha de fin no puede ser anterior a la fecha de inicio.");
  }
  return { startDate: start, endDate: end };
}

async function assertProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) throw new Error("Proyecto no encontrado.");
}

async function assertPhaseBelongsToProject(phaseId: string, projectId: string) {
  const phase = await prisma.projectPhase.findUnique({
    where: { id: phaseId },
    select: { id: true, projectId: true },
  });
  if (!phase) throw new Error("Fase no encontrada.");
  if (phase.projectId !== projectId) {
    throw new Error("La fase no pertenece a este proyecto.");
  }
}

export async function listTasks(projectId: string) {
  return prisma.projectTask.findMany({
    where: { projectId },
    orderBy: [{ position: "asc" }, { startDate: "asc" }],
  });
}

export async function getTask(id: string) {
  const task = await prisma.projectTask.findUnique({
    where: { id }, include: { phase: { select: { id: true, name: true } } },
  });
  if (!task) throw new Error("Tarea no encontrada.");
  return task;
}

async function nextPosition(projectId: string, phaseId: string | null) {
  const agg = await prisma.projectTask.aggregate({
    where: { projectId, phaseId },
    _max: { position: true },
  });
  return (agg._max.position ?? -1) + 1;
}

export async function createTask(input: TaskInput) {
  const data = taskInputSchema.parse(input);
  await assertProject(data.projectId);
  if (data.phaseId) await assertPhaseBelongsToProject(data.phaseId, data.projectId);

  const type = data.type ?? "TASK";
  const status = data.status ?? "TODO";
  const dates = resolveTaskDates(type, data.startDate, data.endDate);
  const position = data.position ?? (await nextPosition(data.projectId, data.phaseId ?? null));

  const task = await prisma.projectTask.create({
    data: {
      projectId: data.projectId,
      phaseId: data.phaseId ?? null,
      name: data.name,
      description: data.description?.trim() || null,
      type,
      startDate: dates.startDate,
      endDate: dates.endDate,
      status,
      position,
      clientVisible: data.clientVisible ?? true,
    },
  });
  revalidatePath(`/projects/${data.projectId}`);
  return task;
}

export async function updateTask(id: string, input: TaskUpdate) {
  const existing = await prisma.projectTask.findUnique({
    where: { id },
    select: { id: true, projectId: true, type: true, startDate: true, endDate: true },
  });
  if (!existing) throw new Error("Tarea no encontrada.");

  const data = taskUpdateSchema.parse(input);
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.description !== undefined) update.description = data.description?.trim() || null;
  if (data.position !== undefined) update.position = data.position;

  if (data.type !== undefined || data.startDate || data.endDate) {
    const type = data.type ?? existing.type;
    const startStr = data.startDate ?? existing.startDate.toISOString().slice(0, 10);
    const endStr = data.endDate ?? existing.endDate.toISOString().slice(0, 10);
    const dates = resolveTaskDates(type, startStr, endStr);
    update.type = type;
    update.startDate = dates.startDate;
    update.endDate = dates.endDate;
  }

  const task = await prisma.projectTask.update({ where: { id }, data: update });
  revalidatePath(`/projects/${existing.projectId}`);
  return task;
}

export async function deleteTask(id: string) {
  const existing = await prisma.projectTask.findUnique({
    where: { id },
    select: { id: true, projectId: true },
  });
  if (!existing) throw new Error("Tarea no encontrada.");
  await prisma.projectTask.delete({ where: { id } });
  revalidatePath(`/projects/${existing.projectId}`);
  return { id };
}

export async function setTaskStatus(id: string, status: ProjectTaskStatus) {
  const existing = await prisma.projectTask.findUnique({
    where: { id },
    select: { id: true, projectId: true },
  });
  if (!existing) throw new Error("Tarea no encontrada.");
  z.enum(TASK_STATUSES).parse(status);

  const task = await prisma.projectTask.update({ where: { id }, data: { status } });
  revalidatePath(`/projects/${existing.projectId}`);
  return task;
}

export async function setTaskPhase(id: string, phaseId: string | null) {
  const existing = await prisma.projectTask.findUnique({
    where: { id },
    select: { id: true, projectId: true },
  });
  if (!existing) throw new Error("Tarea no encontrada.");
  if (phaseId) await assertPhaseBelongsToProject(phaseId, existing.projectId);

  const task = await prisma.$transaction(async (tx) => {
    const max = await tx.projectTask.aggregate({
      where: { projectId: existing.projectId, phaseId }, _max: { position: true },
    });
    return tx.projectTask.update({
      where: { id }, data: { phaseId, position: (max._max.position ?? -1) + 1 },
    });
  });
  revalidatePath(`/projects/${existing.projectId}`);
  return task;
}

export async function setTaskClientVisible(id: string, clientVisible: boolean) {
  const existing = await prisma.projectTask.findUnique({
    where: { id },
    select: { id: true, projectId: true },
  });
  if (!existing) throw new Error("Tarea no encontrada.");
  const task = await prisma.projectTask.update({ where: { id }, data: { clientVisible } });
  revalidatePath(`/projects/${existing.projectId}`);
  return task;
}

export type ApplyTaskChangesInput = {
  projectId: string;
  creates: Array<{
    name: string;
    description?: string | null;
    phaseId: string | null;
    type?: string;
    startDate: string;
    endDate: string;
    status?: string;
    clientVisible?: boolean;
  }>;
  updates: Array<{
    id: string;
    name?: string;
    description?: string | null;
    phaseId?: string | null;
    type?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    clientVisible?: boolean;
  }>;
  deletes: string[];
};

export async function applyProjectTaskChanges(input: ApplyTaskChangesInput): Promise<void> {
  const { projectId, creates, updates, deletes } = input;

  // Basic duplicate checks
  const allUpdateIds = updates.map((u) => u.id);
  const updateSet = new Set(allUpdateIds);
  if (updateSet.size !== allUpdateIds.length) throw new Error("IDs duplicados en updates.");
  const deleteSet = new Set(deletes);
  if (deleteSet.size !== deletes.length) throw new Error("IDs duplicados en deletes.");
  for (const id of allUpdateIds) if (deleteSet.has(id)) throw new Error("Una tarea no puede estar en updates y deletes a la vez.");

  await prisma.$transaction(async (tx) => {
    await assertProjectTx(tx, projectId);

    // Validate phases for creates and updates
    const phaseIdsToCheck = new Set<string>();
    for (const c of creates) if (c.phaseId) phaseIdsToCheck.add(c.phaseId);
    for (const u of updates) if (u.phaseId !== undefined && u.phaseId !== null) phaseIdsToCheck.add(u.phaseId);
    for (const pid of phaseIdsToCheck) await assertPhaseBelongsToProjectTx(tx, pid, projectId);

    // Validate deletes belong to project
    if (deletes.length > 0) {
      const delTasks = await tx.projectTask.findMany({
        where: { id: { in: deletes } },
        select: { id: true, projectId: true },
      });
      if (delTasks.length !== deletes.length) throw new Error("Tarea a eliminar no encontrada.");
      for (const t of delTasks) if (t.projectId !== projectId) throw new Error("Tarea no pertenece a este proyecto.");
    }

    // Validate updates belong to project and collect existing for date resolution
    const existingMap = new Map<string, { id: string; projectId: string; type: string; startDate: Date; endDate: Date; phaseId: string | null }>();
    if (updates.length > 0) {
      const ids = updates.map((u) => u.id);
      const existing = await tx.projectTask.findMany({
        where: { id: { in: ids } },
        select: { id: true, projectId: true, type: true, startDate: true, endDate: true, phaseId: true },
      });
      if (existing.length !== ids.length) throw new Error("Tarea a actualizar no encontrada.");
      for (const e of existing) {
        if (e.projectId !== projectId) throw new Error("Tarea no pertenece a este proyecto.");
        existingMap.set(e.id, e);
      }
      // Validate each update's fields
      for (const u of updates) {
        const existing = existingMap.get(u.id)!;
        if (u.status !== undefined) z.enum(TASK_STATUSES).parse(u.status);
        if (u.type !== undefined) z.enum(TASK_TYPES).parse(u.type);
        if (u.name !== undefined && !u.name.trim()) throw new Error("El nombre de la tarea es obligatorio.");
        if (u.startDate !== undefined || u.endDate !== undefined || u.type !== undefined) {
          const type = (u.type ?? existing.type) as ProjectTaskType;
          const startStr = u.startDate ?? existing.startDate.toISOString().slice(0, 10);
          const endStr = u.endDate ?? existing.endDate.toISOString().slice(0, 10);
          resolveTaskDates(type, startStr, endStr);
        }
      }
    }

    // Validate creates
    for (const c of creates) {
      const data = taskInputSchema.parse({
        projectId,
        phaseId: c.phaseId,
        name: c.name,
        description: c.description,
        type: c.type,
        startDate: c.startDate,
        endDate: c.endDate,
        status: c.status,
        clientVisible: c.clientVisible,
      });
      // phase already checked, dates will be resolved again on create
      void data;
      if (c.status !== undefined) z.enum(TASK_STATUSES).parse(c.status);
      if (c.type !== undefined) z.enum(TASK_TYPES).parse(c.type);
    }

    // Compute position per phase: max existing position per phase (including those that will be deleted? exclude deletes)
    const allTasks = await tx.projectTask.findMany({
      where: { projectId, id: { notIn: deletes.length ? deletes : undefined } },
      select: { id: true, phaseId: true, position: true },
    });
    const maxByPhase = new Map<string | null, number>();
    for (const t of allTasks) {
      const key = t.phaseId as string | null;
      const cur = maxByPhase.get(key) ?? -1;
      if (t.position > cur) maxByPhase.set(key, t.position);
    }
    // For creates grouped by phase, assign sequentially
    const nextPosByPhase = new Map<string | null, number>(maxByPhase);
    // For updates that change phase, we need to track new positions
    const movedUpdates: Array<(typeof updates)[number] & { newPosition: number }> = [];
    for (const u of updates) {
      if (u.phaseId !== undefined) {
        const existing = existingMap.get(u.id)!;
        const newPhase = u.phaseId; // may be null
        const oldPhase = existing.phaseId;
        if (newPhase !== oldPhase) {
          const next = (nextPosByPhase.get(newPhase) ?? -1) + 1;
          nextPosByPhase.set(newPhase, next);
          movedUpdates.push({ ...u, newPosition: next });
        }
      }
    }

    // Execute deletes first
    for (const id of deletes) {
      await tx.projectTask.delete({ where: { id } });
    }

    // Execute updates
    for (const u of updates) {
      const existing = existingMap.get(u.id)!;
      const data: Record<string, unknown> = {};
      if (u.name !== undefined) data.name = u.name.trim();
      if (u.description !== undefined) data.description = u.description?.trim() || null;
      if (u.status !== undefined) data.status = u.status;
      if (u.clientVisible !== undefined) data.clientVisible = u.clientVisible;
      if (u.phaseId !== undefined) {
        data.phaseId = u.phaseId;
        // if phase changed, set new position
        const moved = movedUpdates.find((m) => m.id === u.id);
        if (moved) data.position = moved.newPosition;
      }
      if (u.type !== undefined || u.startDate !== undefined || u.endDate !== undefined) {
        const type = (u.type ?? existing.type) as ProjectTaskType;
        const startStr = u.startDate ?? existing.startDate.toISOString().slice(0, 10);
        const endStr = u.endDate ?? existing.endDate.toISOString().slice(0, 10);
        const dates = resolveTaskDates(type, startStr, endStr);
        data.type = type;
        data.startDate = dates.startDate;
        data.endDate = dates.endDate;
      }
      if (Object.keys(data).length > 0) {
        await tx.projectTask.update({ where: { id: u.id }, data });
      }
    }

    // Execute creates grouped by phase for position
    const createsByPhase = new Map<string | null, typeof creates>();
    for (const c of creates) {
      const key = c.phaseId as string | null;
      const arr = createsByPhase.get(key) ?? [];
      arr.push(c);
      createsByPhase.set(key, arr);
    }
    for (const [phaseKey, group] of createsByPhase) {
      let nextPos = (nextPosByPhase.get(phaseKey) ?? -1) + 1;
      // If there were movedUpdates to same phase, nextPos already includes them
      // For creates in same phase as moved, we already incremented for moves, now continue
      for (const c of group) {
        const type = (c.type ?? "TASK") as ProjectTaskType;
        const status = (c.status ?? "TODO") as ProjectTaskStatus;
        const dates = resolveTaskDates(type, c.startDate, c.endDate);
        await tx.projectTask.create({
          data: {
            projectId,
            phaseId: c.phaseId,
            name: c.name.trim(),
            description: c.description?.trim() || null,
            type,
            startDate: dates.startDate,
            endDate: dates.endDate,
            status,
            position: nextPos++,
            clientVisible: c.clientVisible ?? true,
          },
        });
      }
      // Update map for subsequent phases (not needed further)
      nextPosByPhase.set(phaseKey, nextPos - 1);
    }
  });

  revalidatePath(`/projects/${projectId}`);
}

async function assertProjectTx(tx: any, projectId: string) {
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new Error("Proyecto no encontrado.");
}
async function assertPhaseBelongsToProjectTx(tx: any, phaseId: string, projectId: string) {
  const phase = await tx.projectPhase.findUnique({ where: { id: phaseId }, select: { id: true, projectId: true } });
  if (!phase) throw new Error("Fase no encontrada.");
  if (phase.projectId !== projectId) throw new Error("La fase no pertenece a este proyecto.");
}

export async function reorderProjectTasks(
  projectId: string,
  phaseId: string | null,
  orderedTaskIds: string[],
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) throw new Error("Proyecto no encontrado.");

  const tasks = await prisma.projectTask.findMany({
    where: { projectId },
    select: { id: true, phaseId: true },
  });
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const phaseTasks = tasks
    .filter((t) => t.phaseId === phaseId)
    .map((t) => t.id);

  // all provided ids must exist, belong to project and phase; no duplicates; complete list
  const idsSet = new Set(orderedTaskIds);
  if (idsSet.size !== orderedTaskIds.length) {
    throw new Error("No se permiten identificadores repetidos.");
  }
  if (phaseTasks.length !== idsSet.size) {
    throw new Error("La lista de tareas está incompleta.");
  }
  for (const id of orderedTaskIds) {
    const task = taskMap.get(id);
    if (!task) throw new Error("Tarea no encontrada.");
    if (task.phaseId !== phaseId) throw new Error("No se puede mover una tarea a otra fase.");
  }

  await prisma.$transaction(
    orderedTaskIds.map((id, index) =>
      prisma.projectTask.update({ where: { id }, data: { position: index } }),
    ),
  );
  revalidatePath(`/projects/${projectId}`);
}
