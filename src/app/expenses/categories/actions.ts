"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createCategory, updateCategory, deleteCategory, categorySchema } from "@/server/services/expense-categories";

type R = { success: true } | { success: false; message: string };

export async function saveCategory(_prev: R | null, fd: FormData): Promise<R> {
  try {
    await requireRole("ADMIN");
    const data = categorySchema.parse({ name: fd.get("name") });
    const id = fd.get("id") as string | null;
    if (id) await updateCategory(id, data); else await createCategory(data);
    revalidatePath("/expenses");
    return { success: true };
  } catch (e) { return { success: false, message: e instanceof Error ? e.message : "Error." }; }
}

export async function removeCategory(_prev: R | null, fd: FormData): Promise<R> {
  try {
    await requireRole("ADMIN");
    await deleteCategory(fd.get("id") as string);
    revalidatePath("/expenses");
    return { success: true };
  } catch (e) { return { success: false, message: e instanceof Error ? e.message : "Error." }; }
}
