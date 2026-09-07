import "server-only";
import { prisma } from "@/server/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export const incomeTypeSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio."),
  requiresProject: z.boolean().default(false),
});

export type IncomeTypeInput = z.infer<typeof incomeTypeSchema>;

export async function listIncomeTypes() {
  return prisma.incomeType.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { incomes: true } } },
  });
}

export async function createIncomeType(input: IncomeTypeInput) {
  const data = incomeTypeSchema.parse(input);
  try {
    const t = await prisma.incomeType.create({
      data: { name: data.name, requiresProject: data.requiresProject },
    });
    revalidatePath("/incomes");
    return t;
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      throw new Error("Ya existe un tipo con ese nombre.");
    }
    throw e;
  }
}

export async function updateIncomeType(id: string, input: IncomeTypeInput) {
  const data = incomeTypeSchema.parse(input);
  if (data.requiresProject) {
    const unlinked = await prisma.income.count({ where: { typeId: id, projectId: null } });
    if (unlinked > 0) {
      throw new Error("No se puede exigir proyecto mientras existan ingresos sin proyecto.");
    }
  }
  try {
    const t = await prisma.incomeType.update({
      where: { id },
      data: { name: data.name, requiresProject: data.requiresProject },
    });
    revalidatePath("/incomes");
    return t;
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      throw new Error("Ya existe un tipo con ese nombre.");
    }
    throw e;
  }
}

export async function deleteIncomeType(id: string) {
  const t = await prisma.incomeType.findUnique({
    where: { id },
    select: { _count: { select: { incomes: true } } },
  });
  if (!t) throw new Error("Tipo no encontrado.");
  if (t._count.incomes > 0) {
    throw new Error("No se puede eliminar el tipo porque tiene ingresos asociados.");
  }
  await prisma.incomeType.delete({ where: { id } });
  revalidatePath("/incomes");
}
