"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createIncomeType, updateIncomeType, deleteIncomeType, incomeTypeSchema } from "@/server/services/income-types";

type R = { success: true } | { success: false; message: string };

export async function saveIncomeType(_prev: R | null, fd: FormData): Promise<R> {
  try {
    await requireRole("ADMIN");
    const data = incomeTypeSchema.parse({
      name: fd.get("name"),
      requiresProject: fd.get("requiresProject") === "true",
    });
    const id = fd.get("id") as string | null;
    if (id) await updateIncomeType(id, data); else await createIncomeType(data);
    revalidatePath("/incomes");
    return { success: true };
  } catch (e) { return { success: false, message: e instanceof Error ? e.message : "Error." }; }
}

export async function removeIncomeType(_prev: R | null, fd: FormData): Promise<R> {
  try {
    await requireRole("ADMIN");
    await deleteIncomeType(fd.get("id") as string);
    revalidatePath("/incomes");
    return { success: true };
  } catch (e) { return { success: false, message: e instanceof Error ? e.message : "Error." }; }
}
