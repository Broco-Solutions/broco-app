import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const D = Prisma.Decimal;

export const expenseSchema = z.object({
  expenseCategoryId: z.string().min(1, "Categoria requerida."),
  projectId: z.string().nullable().optional(),
  type: z.enum(["FIXED", "VARIABLE"]),
  concept: z.string().trim().min(1, "Concepto requerido."),
  notes: z.string().trim().nullable().optional(),
  status: z.enum(["PAID", "PENDING"]),
  amountUsd: z.number().nullable().optional(),
  amountArs: z.number().nullable().optional(),
  exchangeRate: z.number().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  effectiveDate: z.string().nullable().optional(),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;

function toDec(v: number): Prisma.Decimal { return new D(v); }

function computeMoney(input: {
  amountUsd?: number | null; amountArs?: number | null; exchangeRate?: number | null;
}) {
  const ars = input.amountArs; const usd = input.amountUsd; const fx = input.exchangeRate;
  if (ars != null && ars > 0 && fx != null && fx > 0) {
    const a = toDec(ars); const f = toDec(fx);
    return { amountUsd: new D(a.dividedBy(f).toFixed(6)), amountArs: a, exchangeRate: f };
  }
  if (usd != null && usd > 0 && ars == null && fx == null) {
    return { amountUsd: toDec(usd), amountArs: null, exchangeRate: null };
  }
  throw new Error("Ingresa monto USD, o ARS + tipo de cambio.");
}

export async function listExpenses(filters?: { status?: string; type?: string; categoryId?: string; projectId?: string }) {
  const where: Record<string, unknown> = {};
  if (filters?.type) where.type = filters.type;
  if (filters?.categoryId) where.expenseCategoryId = filters.categoryId;
  if (filters?.projectId) where.projectId = filters.projectId;
  if (filters?.status === "PENDING" || filters?.status === "OVERDUE") where.status = "PENDING";
  else if (filters?.status === "PAID") where.status = "PAID";

  return prisma.expense.findMany({
    where,
    include: { category: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { effectiveDate: "desc" }],
  });
}

export async function listExpensesForMcp(input: {
  from?: Date;
  to?: Date;
  projectId?: string;
  categoryName?: string;
  status?: "PAID" | "PENDING" | "OVERDUE";
  type?: "FIXED" | "VARIABLE";
  today: Date;
  skip: number;
  take: number;
}) {
  const where: Prisma.ExpenseWhereInput = {
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.categoryName
      ? {
          category: {
            name: { equals: input.categoryName, mode: "insensitive" as const },
          },
        }
      : {}),
    ...(input.type ? { type: input.type } : {}),
  };

  if (input.status === "PAID") {
    where.status = "PAID";
    if (input.from && input.to) {
      where.effectiveDate = { gte: input.from, lte: input.to };
    }
  } else if (input.status === "PENDING" || input.status === "OVERDUE") {
    where.status = "PENDING";
    where.dueDate = {
      ...(input.from ? { gte: input.from } : {}),
      ...(input.to ? { lte: input.to } : {}),
      ...(input.status === "OVERDUE" ? { lt: input.today } : {}),
    };
  } else if (input.from && input.to) {
    where.OR = [
      {
        status: "PAID",
        effectiveDate: { gte: input.from, lte: input.to },
      },
      {
        status: "PENDING",
        dueDate: { gte: input.from, lte: input.to },
      },
    ];
  }

  return prisma.expense.findMany({
    where,
    select: {
      id: true,
      concept: true,
      type: true,
      status: true,
      amountUsd: true,
      amountArs: true,
      exchangeRate: true,
      dueDate: true,
      effectiveDate: true,
      category: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: [
      { status: "asc" },
      { dueDate: "asc" },
      { effectiveDate: "desc" },
      { id: "asc" },
    ],
    skip: input.skip,
    take: input.take,
  });
}

export async function listPendingExpensesForMcp(input: {
  from: Date;
  to: Date;
  skip: number;
  take: number;
}) {
  return listExpensesForMcp({
    ...input,
    status: "PENDING",
    today: input.from,
  });
}

export async function getExpense(id: string) {
  const e = await prisma.expense.findUnique({ where: { id }, include: { category: true, project: true } });
  if (!e) throw new Error("Gasto no encontrado.");
  return e;
}

export async function createExpense(input: ExpenseInput) {
  const data = expenseSchema.parse(input);
  if (data.status === "PENDING" && !data.dueDate) throw new Error("La fecha de vencimiento es obligatoria.");
  if (data.status === "PAID" && !data.effectiveDate) throw new Error("La fecha de pago es obligatoria.");
  const money = computeMoney(data);
  const e = await prisma.expense.create({
    data: {
      expenseCategoryId: data.expenseCategoryId, projectId: data.projectId ?? null,
      type: data.type as "FIXED" | "VARIABLE", concept: data.concept, notes: data.notes?.trim() || null,
      status: data.status as "PAID" | "PENDING", ...money,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      effectiveDate: data.status === "PAID" ? new Date(data.effectiveDate!) : null,
    },
  });
  revalidatePath("/expenses");
  return e;
}

export async function updateExpense(id: string, input: ExpenseInput) {
  const data = expenseSchema.parse(input);
  if (data.status === "PENDING" && !data.dueDate) throw new Error("La fecha de vencimiento es obligatoria.");
  if (data.status === "PAID" && !data.effectiveDate) throw new Error("La fecha de pago es obligatoria.");
  const money = computeMoney(data);
  const e = await prisma.expense.update({
    where: { id },
    data: {
      expenseCategoryId: data.expenseCategoryId, projectId: data.projectId ?? null,
      type: data.type as "FIXED" | "VARIABLE", concept: data.concept, notes: data.notes?.trim() || null,
      status: data.status as "PAID" | "PENDING", ...money,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      effectiveDate: data.status === "PAID" ? new Date(data.effectiveDate!) : null,
    },
  });
  revalidatePath("/expenses");
  return e;
}

export async function deleteExpense(id: string) {
  const e = await prisma.expense.findUnique({ where: { id } });
  if (!e) throw new Error("Gasto no encontrado.");
  await prisma.expense.delete({ where: { id } });
  revalidatePath("/expenses");
}

export type BatchEntry = {
  expenseCategoryId: string; projectId?: string | null; type: string;
  concept: string; notes?: string | null; status: string;
  amountUsd?: number | null; amountArs?: number | null; exchangeRate?: number | null;
  dueDate?: string | null; effectiveDate?: string | null;
};

export async function createExpenseBatch(entries: BatchEntry[]) {
  await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      const data = expenseSchema.parse(entry);
      if (data.status === "PENDING" && !data.dueDate) throw new Error("La fecha de vencimiento es obligatoria.");
      if (data.status === "PAID" && !data.effectiveDate) throw new Error("La fecha de pago es obligatoria.");
      const money = computeMoney(data);
      await tx.expense.create({
        data: {
          expenseCategoryId: data.expenseCategoryId,
          projectId: data.projectId ?? null,
          type: data.type as "FIXED" | "VARIABLE",
          concept: data.concept,
          notes: data.notes?.trim() || null,
          status: data.status as "PAID" | "PENDING",
          ...money,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          effectiveDate: data.status === "PAID" ? new Date(data.effectiveDate!) : null,
        },
      });
    }
  });
  revalidatePath("/expenses");
}

export async function bulkUpdateExpenses(ids: string[], updates: {
  expenseCategoryId?: string; type?: string; status?: string; amountUsd?: number; amountArs?: number; exchangeRate?: number; concept?: string;
}) {
  const data: Record<string, unknown> = {};
  if (updates.concept != null) {
    const trimmed = updates.concept.trim();
    if (!trimmed) throw new Error("El concepto no puede estar vacío.");
    data.concept = trimmed;
  }
  if (updates.expenseCategoryId) data.expenseCategoryId = updates.expenseCategoryId;
  if (updates.type) data.type = updates.type;
  if (updates.status) data.status = updates.status;
  if (updates.amountArs != null && updates.exchangeRate != null) {
    const money = computeMoney({ amountArs: updates.amountArs, exchangeRate: updates.exchangeRate });
    data.amountUsd = money.amountUsd;
    data.amountArs = money.amountArs;
    data.exchangeRate = money.exchangeRate;
  } else if (updates.amountUsd != null) {
    data.amountUsd = updates.amountUsd;
    data.amountArs = null;
    data.exchangeRate = null;
  }
  if (Object.keys(data).length === 0) return;
  await prisma.expense.updateMany({ where: { id: { in: ids } }, data });
  revalidatePath("/expenses");
}
