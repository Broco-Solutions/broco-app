"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  changeOperationalTaskStatus,
  createOperationalTask,
  operationalTaskCreateSchema,
  operationalTaskStatusSchema,
  operationalTaskUpdateSchema,
  updateOperationalTask,
} from "@/server/services/operational-tasks";

export type TaskActionResult =
  | { success: true; id: string; updatedAt: string; justCompleted?: boolean }
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
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "No se pudo cambiar el estado." };
  }
}
