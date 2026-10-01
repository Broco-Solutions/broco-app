"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createTimeEntryForOperationalTask } from "@/server/services/hours";
import {
  changeOperationalTaskStatus,
  createOperationalTask,
  operationalTaskCreateSchema,
  operationalTaskStatusSchema,
  operationalTaskUpdateSchema,
  updateOperationalTask,
} from "@/server/services/operational-tasks";

export type TaskActionResult =
  | {
      success: true;
      id: string;
      updatedAt: string;
      justCompleted?: boolean;
      status?: "PENDING" | "IN_PROGRESS" | "BLOCKED" | "DONE";
      completedAt?: string | null;
      blockedReason?: string | null;
    }
  | { success: false; message: string };

function optionalString(value: FormDataEntryValue | null): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function revalidateTaskPaths() {
  revalidatePath("/tasks");
  revalidatePath("/hours");
  revalidatePath("/hours/reports");
}

export async function createOperationalTaskAction(
  _previous: TaskActionResult | null,
  formData: FormData,
): Promise<TaskActionResult> {
  try {
    const actor = await requireUser();
    const input = operationalTaskCreateSchema.parse({
      title: formData.get("title"),
      description: optionalString(formData.get("description")),
      assigneeId: optionalString(formData.get("assigneeId")) ?? undefined,
      projectId: optionalString(formData.get("projectId")),
      dueDate: optionalString(formData.get("dueDate")),
    });
    const task = await createOperationalTask(actor, input);
    revalidateTaskPaths();
    return { success: true, id: task.id, updatedAt: task.updatedAt.toISOString() };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "No se pudo crear la tarea." };
  }
}

export async function updateOperationalTaskAction(
  _previous: TaskActionResult | null,
  formData: FormData,
): Promise<TaskActionResult> {
  try {
    const actor = await requireUser();
    const id = String(formData.get("id") ?? "");
    const input = operationalTaskUpdateSchema.parse({
      title: formData.has("title") ? formData.get("title") : undefined,
      description: formData.has("description") ? optionalString(formData.get("description")) : undefined,
      assigneeId: formData.has("assigneeId") ? optionalString(formData.get("assigneeId")) ?? undefined : undefined,
      projectId: formData.has("projectId") ? optionalString(formData.get("projectId")) : undefined,
      dueDate: formData.has("dueDate") ? optionalString(formData.get("dueDate")) : undefined,
      expectedUpdatedAt: formData.get("expectedUpdatedAt"),
    });
    const task = await updateOperationalTask(actor, id, input);
    revalidateTaskPaths();
    return { success: true, id: task.id, updatedAt: task.updatedAt.toISOString() };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "No se pudo actualizar la tarea." };
  }
}

export async function changeOperationalTaskStatusAction(
  _previous: TaskActionResult | null,
  formData: FormData,
): Promise<TaskActionResult> {
  try {
    const actor = await requireUser();
    const id = String(formData.get("id") ?? "");
    const input = operationalTaskStatusSchema.parse({
      status: formData.get("status"),
      blockedReason: optionalString(formData.get("blockedReason")),
      expectedUpdatedAt: formData.get("expectedUpdatedAt"),
    });
    const result = await changeOperationalTaskStatus(actor, id, input);
    revalidateTaskPaths();
    return {
      success: true,
      id: result.task.id,
      updatedAt: result.task.updatedAt.toISOString(),
      justCompleted: result.justCompleted,
      status: result.task.status,
      completedAt: result.task.completedAt?.toISOString() ?? null,
      blockedReason: result.task.blockedReason,
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "No se pudo cambiar el estado." };
  }
}

export async function registerOperationalTaskTimeAction(
  _previous: TaskActionResult | null,
  formData: FormData,
): Promise<TaskActionResult> {
  try {
    const actor = await requireUser();
    const hours = Number(formData.get("hours") ?? 0);
    const minutesPart = Number(formData.get("minutes") ?? 0);
    if (!Number.isInteger(hours) || hours < 0 || hours > 24) throw new Error("Las horas deben estar entre 0 y 24.");
    if (!Number.isInteger(minutesPart) || minutesPart < 0 || minutesPart > 59) throw new Error("Los minutos deben estar entre 0 y 59.");
    const minutes = hours * 60 + minutesPart;
    if (minutes <= 0 || minutes > 1440) throw new Error("Ingresá una duración entre 1 minuto y 24 horas.");
    const entry = await createTimeEntryForOperationalTask(actor, {
      taskId: String(formData.get("taskId") ?? ""),
      workDate: String(formData.get("workDate") ?? ""),
      minutes,
      additionalDetail: optionalString(formData.get("additionalDetail")),
      idempotencyKey: String(formData.get("operationId") ?? ""),
    });
    revalidateTaskPaths();
    return { success: true, id: entry.id, updatedAt: entry.createdAt.toISOString() };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "No se pudo registrar el tiempo." };
  }
}
