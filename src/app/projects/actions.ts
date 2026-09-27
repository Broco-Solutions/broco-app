"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  createProject,
  updateProject,
  deleteProject as deleteProjectSvc,
  projectInputSchema,
} from "@/server/services/projects";

type ActionResult = { success: true } | { success: false; message: string };

async function requireAuth() {
  await requireRole("ADMIN");
}

function parseNumber(v: FormDataEntryValue | null): number | undefined {
  if (v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function saveProject(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAuth();
    const data = projectInputSchema.parse({
      clientId: formData.get("clientId"),
      name: formData.get("name"),
      isActive: formData.get("isActive") === "true",
      startDate: formData.get("startDate") || null,
      endDate: formData.get("endDate") || null,
      goLiveDate: formData.get("goLiveDate") || null,
      notes: formData.get("notes") || null,
      oneTimeOriginalAmount: parseNumber(formData.get("oneTimeOriginalAmount")),
      oneTimeCurrency: formData.get("oneTimeCurrency") || null,
      oneTimeExchangeRate: parseNumber(formData.get("oneTimeExchangeRate")),
      monthlyRecurringOriginalAmount: parseNumber(formData.get("monthlyRecurringOriginalAmount")),
      monthlyRecurringCurrency: formData.get("monthlyRecurringCurrency") || null,
      monthlyRecurringExchangeRate: parseNumber(formData.get("monthlyRecurringExchangeRate")),
    });

    const id = formData.get("id") as string | null;
    if (id) {
      await updateProject(id, data);
    } else {
      await createProject(data);
    }
    revalidatePath("/projects");
    revalidatePath("/clients/[id]");
    revalidatePath("/incomes");
    revalidatePath("/expenses");
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al guardar." };
  }
}

export async function removeProject(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAuth();
    await deleteProjectSvc(formData.get("id") as string);
    revalidatePath("/projects");
    revalidatePath("/clients/[id]");
    revalidatePath("/incomes");
    revalidatePath("/expenses");
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al eliminar." };
  }
}

export async function toggleProjectActive(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAuth();
    const id = formData.get("id") as string;
    const clientId = formData.get("clientId") as string;
    const name = formData.get("name") as string;
    const isActive = formData.get("isActive") === "true";
    await updateProject(id, {
      clientId,
      name,
      isActive: !isActive,
    });
    revalidatePath("/projects");
    revalidatePath("/clients/[id]");
    revalidatePath("/incomes");
    revalidatePath("/expenses");
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error." };
  }
}
