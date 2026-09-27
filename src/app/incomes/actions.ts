"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createIncome, updateIncome, deleteIncome, incomeSchema, createIncomeBatch as batchCreate, bulkUpdateIncomes as bulkUpdateSvc } from "@/server/services/incomes";

type ActionResult = { success: true } | { success: false; message: string };

async function requireAuth() {
  await requireRole("ADMIN");
}

function parseNum(v: FormDataEntryValue | null): number | undefined {
  if (v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function saveIncome(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    await requireAuth();
    const data = incomeSchema.parse({
      projectId: formData.get("projectId") || null,
      clientId: formData.get("clientId") || null,
      typeId: formData.get("typeId"),
      concept: formData.get("concept"),
      notes: formData.get("notes") || null,
      status: formData.get("status"),
      amountUsd: parseNum(formData.get("amountUsd")),
      amountArs: parseNum(formData.get("amountArs")),
      exchangeRate: parseNum(formData.get("exchangeRate")),
      dueDate: formData.get("dueDate") || null,
      effectiveDate: formData.get("effectiveDate") || null,
    });

    const id = formData.get("id") as string | null;
    if (id) { await updateIncome(id, data); } else { await createIncome(data); }
    revalidatePath("/incomes");
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al guardar." };
  }
}

export async function removeIncome(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    await requireAuth();
    await deleteIncome(formData.get("id") as string);
    revalidatePath("/incomes");
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al eliminar." };
  }
}

export async function payIncome(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    await requireAuth();
    const id = formData.get("id") as string;
    const inc = await import("@/server/services/incomes").then((m) => m.getIncome(id));
    const data = incomeSchema.parse({
      projectId: inc.projectId, clientId: inc.clientId, typeId: inc.typeId, concept: inc.concept, notes: inc.notes,
      status: "PAID", amountUsd: parseNum(formData.get("amountUsd")) ?? Number(inc.amountUsd),
      amountArs: parseNum(formData.get("amountArs")) ?? (inc.amountArs ? Number(inc.amountArs) : undefined),
      exchangeRate: parseNum(formData.get("exchangeRate")) ?? (inc.exchangeRate ? Number(inc.exchangeRate) : undefined),
      dueDate: inc.dueDate?.toISOString().slice(0, 10) ?? null, effectiveDate: formData.get("effectiveDate") as string,
    });
    await updateIncome(id, data);
    revalidatePath("/incomes");
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al cobrar." };
  }
}

export async function createIncomeBatch(entries: Array<{
  typeId: string; projectId?: string | null; clientId?: string | null;
  concept: string; notes?: string | null; status: string;
  amountUsd?: number | null; amountArs?: number | null; exchangeRate?: number | null;
  dueDate?: string | null; effectiveDate?: string | null;
}>) {
  try {
    await requireAuth();
    await batchCreate(entries);
    revalidatePath("/incomes");
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al guardar lote." };
  }
}

export async function bulkUpdateIncomes(ids: string[], updates: Record<string, unknown>): Promise<ActionResult> {
  try {
    await requireAuth();
    await bulkUpdateSvc(ids, updates as any);
    revalidatePath("/incomes");
    return { success: true };
  } catch (e) { return { success: false, message: e instanceof Error ? e.message : "Error." }; }
}
