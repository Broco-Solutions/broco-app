"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  createPhase,
  updatePhase,
  deletePhase,
  phaseInputSchema,
} from "@/server/services/project-phases";
import {
  createTask,
  updateTask,
  deleteTask,
  setTaskStatus,
  setTaskPhase,
  setTaskClientVisible,
  reorderProjectTasks,
  applyProjectTaskChanges,
  taskInputSchema,
  taskUpdateSchema,
  TASK_STATUSES,
} from "@/server/services/project-tasks";
import {
  configureShareAccess,
  revealPassword,
  changeShareAccessPassword,
  revokeShareAccess,
  activateShareAccess,
  setClientSharedFolder,
  clearClientSharedFolder,
} from "@/server/services/project-sharing";

export type ActionResult = { success: true } | { success: false; message: string };

async function requireAuth() {
  await requireRole("ADMIN");
}

function str(v: FormDataEntryValue | null): string | null {
  return v == null ? null : String(v).trim() || null;
}

function num(v: FormDataEntryValue | null): number | undefined {
  if (v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function bool(v: FormDataEntryValue | null): boolean | undefined {
  if (v === null || v === "") return undefined;
  const s = String(v);
  if (s === "true" || s === "on" || s === "1") return true;
  if (s === "false" || s === "0") return false;
  return undefined;
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export async function savePhase(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAuth();
    const id = str(formData.get("id"));
    const data = phaseInputSchema.parse({
      projectId: str(formData.get("projectId")),
      name: str(formData.get("name")),
      position: num(formData.get("position")),
    });
    if (id) {
      await updatePhase(id, { name: data.name, position: data.position });
    } else {
      await createPhase(data);
    }
    revalidatePath(`/projects/${data.projectId}`);
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al guardar." };
  }
}

export async function removePhase(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAuth();
    const id = str(formData.get("id"));
    if (!id) return { success: false, message: "Fase no encontrada." };
    await deletePhase(id);
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al eliminar." };
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function saveTask(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAuth();
    const id = str(formData.get("id"));
    const parsed = taskInputSchema.parse({
      projectId: str(formData.get("projectId")),
      phaseId: str(formData.get("phaseId")),
      name: str(formData.get("name")),
      description: str(formData.get("description")),
      type: str(formData.get("type")) ?? undefined,
      startDate: str(formData.get("startDate")),
      endDate: str(formData.get("endDate")),
      status: str(formData.get("status")) ?? undefined,
      position: num(formData.get("position")),
      clientVisible: bool(formData.get("clientVisible")),
    });

    if (id) {
      const update = taskUpdateSchema.parse({
        name: str(formData.get("name")) ?? undefined,
        description: str(formData.get("description")) ?? undefined,
        type: str(formData.get("type")) ?? undefined,
        startDate: str(formData.get("startDate")) ?? undefined,
        endDate: str(formData.get("endDate")) ?? undefined,
        position: num(formData.get("position")),
      });
      await updateTask(id, update);
    } else {
      await createTask(parsed);
    }
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al guardar." };
  }
}

export async function removeTask(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAuth();
    const id = str(formData.get("id"));
    if (!id) return { success: false, message: "Tarea no encontrada." };
    await deleteTask(id);
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al eliminar." };
  }
}

export async function changeTaskStatus(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAuth();
    const id = str(formData.get("id"));
    const status = str(formData.get("status"));
    if (!id || !status) return { success: false, message: "Datos incompletos." };
    if (!TASK_STATUSES.includes(status as (typeof TASK_STATUSES)[number])) {
      return { success: false, message: "Estado inválido." };
    }
    await setTaskStatus(id, status as (typeof TASK_STATUSES)[number]);
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al actualizar." };
  }
}

export async function changeTaskPhase(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAuth();
    const id = str(formData.get("id"));
    const phaseId = str(formData.get("phaseId"));
    if (!id) return { success: false, message: "Tarea no encontrada." };
    await setTaskPhase(id, phaseId);
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al actualizar." };
  }
}

export async function changeTaskClientVisible(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAuth();
    const id = str(formData.get("id"));
    const visible = bool(formData.get("clientVisible"));
    if (!id || visible === undefined) {
      return { success: false, message: "Datos incompletos." };
    }
    await setTaskClientVisible(id, visible);
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al actualizar." };
  }
}

// ---------------------------------------------------------------------------
// Share access (V1.1: slug + password)
// ---------------------------------------------------------------------------

export async function configureAccessAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<{ success: true; slug: string; password: string } | { success: false; message: string }> {
  try {
    await requireAuth();
    const projectId = str(formData.get("projectId"));
    if (!projectId) return { success: false, message: "Proyecto no encontrado." };
    const password = str(formData.get("password")) ?? undefined;
    const result = await configureShareAccess(projectId, password);
    return { success: true, slug: result.slug, password: result.password };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al configurar." };
  }
}

export async function revealPasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<{ success: true; password: string } | { success: false; message: string }> {
  try {
    await requireAuth();
    const projectId = str(formData.get("projectId"));
    if (!projectId) return { success: false, message: "Proyecto no encontrado." };
    const password = await revealPassword(projectId);
    return { success: true, password };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al revelar." };
  }
}

export async function changePasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<{ success: true; password: string } | { success: false; message: string }> {
  try {
    await requireAuth();
    const projectId = str(formData.get("projectId"));
    if (!projectId) return { success: false, message: "Proyecto no encontrado." };
    const password = str(formData.get("password")) ?? undefined;
    const newPassword = await changeShareAccessPassword(projectId, password);
    return { success: true, password: newPassword };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al cambiar." };
  }
}

export async function deactivateAccessAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAuth();
    const projectId = str(formData.get("projectId"));
    if (!projectId) return { success: false, message: "Proyecto no encontrado." };
    await revokeShareAccess(projectId);
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al desactivar." };
  }
}

export async function activateAccessAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAuth();
    const projectId = str(formData.get("projectId"));
    if (!projectId) return { success: false, message: "Proyecto no encontrado." };
    await activateShareAccess(projectId);
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al activar." };
  }
}

// ---------------------------------------------------------------------------
// Shared folder (carpeta compartida del proyecto)
// ---------------------------------------------------------------------------

export async function saveSharedFolderAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAuth();
    const projectId = str(formData.get("projectId"));
    if (!projectId) return { success: false, message: "Proyecto no encontrado." };
    const url = str(formData.get("url"));
    if (!url) {
      return { success: false, message: "El enlace es obligatorio para guardar la carpeta compartida." };
    }
    const label = str(formData.get("label")) ?? undefined;
    await setClientSharedFolder(projectId, url, label);
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al guardar." };
  }
}

export async function removeSharedFolderAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAuth();
    const projectId = str(formData.get("projectId"));
    if (!projectId) return { success: false, message: "Proyecto no encontrado." };
    await clearClientSharedFolder(projectId);
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al quitar el enlace." };
  }
}

export async function changeTaskDatesAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAuth();
    const taskId = str(formData.get("taskId"));
    const startDate = str(formData.get("startDate"));
    const endDate = str(formData.get("endDate"));
    if (!taskId || !startDate || !endDate) {
      return { success: false, message: "Datos incompletos." };
    }
    await updateTask(taskId, { startDate, endDate });
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al guardar." };
  }
}

export async function reorderTasksAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAuth();
    const projectId = str(formData.get("projectId"));
    const phaseId = str(formData.get("phaseId"));
    const raw = formData.get("orderedTaskIds");
    if (!projectId || !raw) return { success: false, message: "Datos incompletos." };
    const orderedTaskIds = String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await reorderProjectTasks(projectId, phaseId, orderedTaskIds);
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al reordenar." };
  }
}

export async function applyProjectTaskChangesAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAuth();
    const raw = formData.get("payload");
    if (!raw) return { success: false, message: "Datos incompletos." };
    const payload = JSON.parse(String(raw)) as {
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
    if (!payload.projectId) return { success: false, message: "Proyecto no encontrado." };
    await applyProjectTaskChanges({
      projectId: payload.projectId,
      creates: payload.creates ?? [],
      updates: payload.updates ?? [],
      deletes: payload.deletes ?? [],
    });
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al guardar." };
  }
}
