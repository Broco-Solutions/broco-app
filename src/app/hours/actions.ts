"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createTimeEntry, updateTimeEntry, voidTimeEntry } from "@/server/services/hours";

type Result = { success: true; id?: string } | { success: false; message: string };

export async function saveTimeEntry(_prev: Result | null, formData: FormData): Promise<Result> {
  try {
    const actor = await requireUser();
    const unit = String(formData.get("unit") ?? "MINUTES");
    const raw = String(formData.get("duration") ?? "").replace(",", ".");
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("La duración debe ser positiva.");
    if (unit === "MINUTES" && !Number.isInteger(amount)) throw new Error("Los minutos deben ser un número entero.");
    const exact = unit === "HOURS" ? amount * 60 : amount;
    const minutes = Math.round(exact);
    if (minutes !== exact) throw new Error(`La duración se redondearía a ${minutes} minutos. Ajustá el valor antes de guardar.`);
    const result = await createTimeEntry(actor, { userId: String(formData.get("userId") || actor.id), projectId: String(formData.get("projectId")), workDate: String(formData.get("workDate")), minutes, description: String(formData.get("description") ?? ""), referenceUrl: formData.get("referenceUrl") ? String(formData.get("referenceUrl")) : null, idempotencyKey: String(formData.get("operationId")) });
    revalidatePath("/hours"); revalidatePath("/hours/reports");
    return { success: true, id: result.id };
  } catch (error) { return { success: false, message: error instanceof Error ? error.message : "No se pudo guardar." }; }
}

export async function voidEntry(formData: FormData): Promise<void> {
  const actor = await requireUser();
  await voidTimeEntry(actor, String(formData.get("id")), String(formData.get("reason") ?? ""));
  revalidatePath("/hours"); revalidatePath("/hours/reports");
}

export async function updateEntry(_prev: Result | null, formData: FormData): Promise<Result> {
  try {
    const actor = await requireUser();
    const raw = String(formData.get("duration") ?? "").replace(",", ".");
    const amount = Number(raw); const unit = String(formData.get("unit") ?? "MINUTES");
    if (!Number.isFinite(amount) || amount <= 0 || (unit === "MINUTES" && !Number.isInteger(amount))) throw new Error("Duración inválida.");
    const exact = unit === "HOURS" ? amount * 60 : amount; const minutes = Math.round(exact);
    if (exact !== minutes) throw new Error(`La duración se redondearía a ${minutes} minutos.`);
    const result = await updateTimeEntry(actor, String(formData.get("id")), { projectId: String(formData.get("projectId")), workDate: String(formData.get("workDate")), minutes, description: String(formData.get("description") ?? ""), referenceUrl: formData.get("referenceUrl") ? String(formData.get("referenceUrl")) : null }, String(formData.get("reason") ?? ""));
    revalidatePath("/hours"); revalidatePath("/hours/reports"); return { success: true, id: result.id };
  } catch (error) { return { success: false, message: error instanceof Error ? error.message : "No se pudo corregir." }; }
}
