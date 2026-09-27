"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createExpense, updateExpense, deleteExpense, expenseSchema, getExpense, createExpenseBatch as batchCreate, bulkUpdateExpenses as bulkUpdateSvc } from "@/server/services/expenses";

type R = { success: true } | { success: false; message: string };
function pn(v: FormDataEntryValue | null) { if (!v || v === "") return undefined; const n = Number(v); return Number.isFinite(n) ? n : undefined; }
function parsePaymentMoney(fd: FormData) {
  const currency = String(fd.get("currency") ?? "");
  if (currency === "USD") return { amountUsd: pn(fd.get("amountUsd")), amountArs: null, exchangeRate: null };
  if (currency === "ARS") return { amountUsd: null, amountArs: pn(fd.get("amountArs")), exchangeRate: pn(fd.get("exchangeRate")) };
  throw new Error("Moneda de pago inválida.");
}

export async function saveExpense(_prev: R | null, fd: FormData): Promise<R> {
  try {
    await requireRole("ADMIN");
    const data = expenseSchema.parse({
      expenseCategoryId: fd.get("expenseCategoryId"), projectId: fd.get("projectId") || null,
      type: fd.get("type"), concept: fd.get("concept"), notes: fd.get("notes") || null,
      status: fd.get("status"), amountUsd: pn(fd.get("amountUsd")), amountArs: pn(fd.get("amountArs")),
      exchangeRate: pn(fd.get("exchangeRate")), dueDate: fd.get("dueDate") || null, effectiveDate: fd.get("effectiveDate") || null,
    });
    const id = fd.get("id") as string | null;
    if (id) await updateExpense(id, data); else await createExpense(data);
    revalidatePath("/expenses");
    return { success: true };
  } catch (e) { return { success: false, message: e instanceof Error ? e.message : "Error." }; }
}

export async function removeExpense(_prev: R | null, fd: FormData): Promise<R> {
  try { await requireRole("ADMIN"); await deleteExpense(fd.get("id") as string); revalidatePath("/expenses"); return { success: true }; }
  catch (e) { return { success: false, message: e instanceof Error ? e.message : "Error." }; }
}

export async function payExpense(_prev: R | null, fd: FormData): Promise<R> {
  try {
    await requireRole("ADMIN");
    const id = fd.get("id") as string;
    const e = await getExpense(id);
    const money = parsePaymentMoney(fd);
    const data = expenseSchema.parse({
      expenseCategoryId: e.expenseCategoryId, projectId: e.projectId, type: e.type, concept: e.concept, notes: e.notes,
      status: "PAID", ...money,
      dueDate: null, effectiveDate: fd.get("effectiveDate") as string,
    });
    await updateExpense(id, data);
    revalidatePath("/expenses");
    return { success: true };
  } catch (e) { return { success: false, message: e instanceof Error ? e.message : "Error." }; }
}

export async function createExpenseBatch(entries: Array<{
  expenseCategoryId: string; projectId?: string | null; type: string;
  concept: string; notes?: string | null; status: string;
  amountUsd?: number | null; amountArs?: number | null; exchangeRate?: number | null;
  dueDate?: string | null; effectiveDate?: string | null;
}>): Promise<R> {
  try {
    await requireRole("ADMIN");
    await batchCreate(entries);
    revalidatePath("/expenses");
    return { success: true };
  } catch (e) { return { success: false, message: e instanceof Error ? e.message : "Error al guardar lote." }; }
}

export async function bulkUpdateExpenses(ids: string[], updates: Record<string, unknown>): Promise<R> {
  try {
    await requireRole("ADMIN");
    await bulkUpdateSvc(ids, updates as any);
    revalidatePath("/expenses");
    return { success: true };
  } catch (e) { return { success: false, message: e instanceof Error ? e.message : "Error." }; }
}
