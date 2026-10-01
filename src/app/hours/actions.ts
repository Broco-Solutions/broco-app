"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { parseTimeDuration } from "@/lib/time-duration";
import { createTimeEntry, updateTimeEntry, voidTimeEntry } from "@/server/services/hours";

type Result = { success: true; id?: string; reset?: boolean } | { success: false; message: string };

export async function saveTimeEntry(_prev: Result | null, formData: FormData): Promise<Result> {
  try {
    const actor = await requireUser();
    const minutes = parseTimeDuration(formData.get("duration"), formData.get("unit"));
    await createTimeEntry(actor, { userId: String(formData.get("userId") || actor.id), projectId: String(formData.get("projectId")), workDate: String(formData.get("workDate")), minutes, description: String(formData.get("description") ?? ""), referenceUrl: formData.get("referenceUrl") ? String(formData.get("referenceUrl")) : null, idempotencyKey: String(formData.get("operationId")) });
  } catch (error) { return { success: false, message: error instanceof Error ? error.message : "No se pudo guardar." }; }
  revalidatePath("/hours"); revalidatePath("/hours/reports");
  const params = new URLSearchParams({ saved: "1", clientId: String(formData.get("clientId") ?? ""), projectId: String(formData.get("projectId") ?? ""), workDate: String(formData.get("workDate") ?? "") });
  redirect(`/hours?${params.toString()}`);
}

export async function voidEntry(formData: FormData): Promise<void> {
  const actor = await requireUser();
  await voidTimeEntry(actor, String(formData.get("id")), String(formData.get("reason") ?? ""));
  revalidatePath("/hours"); revalidatePath("/hours/reports");
}

export async function updateEntry(_prev: Result | null, formData: FormData): Promise<Result> {
  try {
    const actor = await requireUser();
    const minutes = parseTimeDuration(formData.get("duration"), formData.get("unit"));
    const result = await updateTimeEntry(actor, String(formData.get("id")), { projectId: String(formData.get("projectId")), workDate: String(formData.get("workDate")), minutes, description: String(formData.get("description") ?? ""), referenceUrl: formData.get("referenceUrl") ? String(formData.get("referenceUrl")) : null }, String(formData.get("reason") ?? ""), String(formData.get("expectedUpdatedAt") ?? ""));
    revalidatePath("/hours"); revalidatePath("/hours/reports"); return { success: true, id: result.id };
  } catch (error) { return { success: false, message: error instanceof Error ? error.message : "No se pudo corregir." }; }
}
