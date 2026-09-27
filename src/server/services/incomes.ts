import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const D = Prisma.Decimal;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const incomeSchema = z.object({
  projectId: z.string().nullable().optional(),
  clientId: z.string().nullable().optional(),
  typeId: z.string().min(1, "El tipo es obligatorio."),
  concept: z.string().trim().min(1, "El concepto es obligatorio."),
  notes: z.string().trim().nullable().optional(),
  status: z.enum(["PAID", "PENDING"]),
  amountUsd: z.number().nullable().optional(),
  amountArs: z.number().nullable().optional(),
  exchangeRate: z.number().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  effectiveDate: z.string().nullable().optional(),
});

export type IncomeInput = z.infer<typeof incomeSchema>;


// ---------------------------------------------------------------------------
// Decimal helpers
// ---------------------------------------------------------------------------

function toDec(v: number): Prisma.Decimal { return new D(v); }

function computeMoney(input: {
  amountUsd?: number | null;
  amountArs?: number | null;
  exchangeRate?: number | null;
}): { amountUsd: Prisma.Decimal; amountArs: Prisma.Decimal | null; exchangeRate: Prisma.Decimal | null } {
  const usd = input.amountUsd;
  const ars = input.amountArs;
  const fx = input.exchangeRate;

  // ARS + rate → compute USD
  if (ars != null && ars > 0 && fx != null && fx > 0) {
    const arsDec = toDec(ars);
    const fxDec = toDec(fx);
    const usdDec = new D(arsDec.dividedBy(fxDec).toFixed(6));
    return { amountUsd: usdDec, amountArs: arsDec, exchangeRate: fxDec };
  }

  // USD only
  if (usd != null && usd > 0 && ars == null && fx == null) {
    return { amountUsd: toDec(usd), amountArs: null, exchangeRate: null };
  }

  throw new Error("Ingresa monto USD, o ARS + tipo de cambio.");
}

async function validateType(typeId: string, projectId?: string | null) {
  const incomeType = await prisma.incomeType.findUnique({
    where: { id: typeId },
    select: { requiresProject: true, isActive: true },
  });
  if (!incomeType) throw new Error("Tipo no encontrado.");
  if (!incomeType.isActive) throw new Error("El tipo seleccionado está inactivo.");
  if (incomeType.requiresProject && !projectId) {
    throw new Error("Este tipo requiere un proyecto asociado.");
  }
  return incomeType;
}

async function resolveIncomeClient(projectId: string | null | undefined, clientId: string | null | undefined) {
  if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { clientId: true } });
    if (!project) throw new Error("Proyecto no encontrado.");
    if (clientId && clientId !== project.clientId) throw new Error("El cliente no coincide con el proyecto.");
    return project.clientId;
  }
  if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new Error("Cliente no encontrado.");
  }
  return clientId ?? null;
}

function validateDates(data: IncomeInput) {
  if (data.status === "PENDING" && !data.dueDate) {
    throw new Error("La fecha de vencimiento es obligatoria para ingresos pendientes.");
  }
  if (data.status === "PAID" && !data.effectiveDate) {
    throw new Error("La fecha de cobro es obligatoria para ingresos pagados.");
  }
}


// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listIncomes(filters?: {
  status?: string;
  typeId?: string;
  clientId?: string;
  projectId?: string;
}) {
  const where: Record<string, unknown> = {};
  if (filters?.typeId) where.typeId = filters.typeId;
  if (filters?.clientId) where.clientId = filters.clientId;
  if (filters?.projectId) where.projectId = filters.projectId;

  if (filters?.status === "PENDING" || filters?.status === "OVERDUE") {
    where.status = "PENDING";
  } else if (filters?.status === "PAID") {
    where.status = "PAID";
  }

  return prisma.income.findMany({
    where,
    include: {
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      type: { select: { id: true, name: true, requiresProject: true } },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { effectiveDate: "desc" }],
  });
}

export type McpFinancialStatusFilter = "PAID" | "PENDING" | "OVERDUE";

export async function listIncomesForMcp(input: {
  incomeId?: string;
  from?: Date;
  to?: Date;
  projectId?: string;
  clientId?: string;
  status?: McpFinancialStatusFilter;
  typeName?: string;
  today: Date;
  skip: number;
  take: number;
}) {
  const where: Prisma.IncomeWhereInput = {
    ...(input.incomeId ? { id: input.incomeId } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.clientId ? { clientId: input.clientId } : {}),
    ...(input.typeName
      ? {
          type: {
            name: { equals: input.typeName, mode: "insensitive" as const },
          },
        }
      : {}),
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

  return prisma.income.findMany({
    where,
    select: {
      id: true,
      concept: true,
      status: true,
      amountUsd: true,
      amountArs: true,
      exchangeRate: true,
      dueDate: true,
      effectiveDate: true,
      type: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
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

export type IncomeMcpPatch = Partial<Pick<IncomeInput,
  "projectId" | "clientId" | "typeId" | "concept" | "status" |
  "amountUsd" | "amountArs" | "exchangeRate" | "dueDate" | "effectiveDate"
>>;

/** Applies a controlled partial update while preserving UI-only notes. */
export async function patchIncomeForMcp(id: string, patch: IncomeMcpPatch) {
  const existing = await getIncome(id);
  const next: IncomeInput = {
    projectId: patch.projectId === undefined ? existing.projectId : patch.projectId,
    clientId: patch.clientId === undefined ? existing.clientId : patch.clientId,
    typeId: patch.typeId ?? existing.typeId,
    concept: patch.concept ?? existing.concept,
    notes: existing.notes,
    status: patch.status ?? existing.status,
    amountUsd: patch.amountUsd === undefined ? Number(existing.amountUsd) : patch.amountUsd,
    amountArs: patch.amountArs === undefined ? (existing.amountArs === null ? null : Number(existing.amountArs)) : patch.amountArs,
    exchangeRate: patch.exchangeRate === undefined ? (existing.exchangeRate === null ? null : Number(existing.exchangeRate)) : patch.exchangeRate,
    dueDate: patch.dueDate === undefined ? (existing.dueDate?.toISOString().slice(0, 10) ?? null) : patch.dueDate,
    effectiveDate: patch.effectiveDate === undefined ? (existing.effectiveDate?.toISOString().slice(0, 10) ?? null) : patch.effectiveDate,
  };
  return updateIncome(id, next);
}

export async function markIncomePaidForMcp(id: string, effectiveDate: string) {
  return patchIncomeForMcp(id, { status: "PAID", effectiveDate });
}

export async function listPendingIncomesForMcp(input: {
  from: Date;
  to: Date;
  skip: number;
  take: number;
}) {
  return listIncomesForMcp({
    ...input,
    status: "PENDING",
    today: input.from,
  });
}

export async function getIncome(id: string) {
  const income = await prisma.income.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, clientId: true } },
      type: { select: { id: true, name: true, requiresProject: true } },
    },
  });
  if (!income) throw new Error("Ingreso no encontrado.");
  return income;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createIncome(input: IncomeInput) {
  const data = incomeSchema.parse(input);
  await validateType(data.typeId, data.projectId);

  // Resolve client from project
  const clientId = await resolveIncomeClient(data.projectId, data.clientId);

  validateDates(data);

  const money = computeMoney(data);

  const income = await prisma.income.create({
    data: {
      clientId,
      projectId: data.projectId ?? null,
      typeId: data.typeId,
      concept: data.concept,
      notes: data.notes?.trim() || null,
      status: data.status as "PAID" | "PENDING",
      ...money,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      effectiveDate: data.status === "PAID" ? new Date(data.effectiveDate!) : null,
    },
  });
  revalidatePath("/incomes");
  return income;
}

export async function updateIncome(id: string, input: IncomeInput) {
  const data = incomeSchema.parse(input);
  await validateType(data.typeId, data.projectId);

  const clientId = await resolveIncomeClient(data.projectId, data.clientId);

  validateDates(data);

  const money = computeMoney(data);

  const income = await prisma.income.update({
    where: { id },
    data: {
      clientId,
      projectId: data.projectId ?? null,
      typeId: data.typeId,
      concept: data.concept,
      notes: data.notes?.trim() || null,
      status: data.status as "PAID" | "PENDING",
      ...money,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      effectiveDate: data.status === "PAID" ? new Date(data.effectiveDate!) : null,
    },
  });
  revalidatePath("/incomes");
  return income;
}

export async function deleteIncome(id: string) {
  const existing = await prisma.income.findUnique({ where: { id } });
  if (!existing) throw new Error("Ingreso no encontrado.");
  await prisma.income.delete({ where: { id } });
  revalidatePath("/incomes");
}

export type BatchEntry = {
  typeId: string; projectId?: string | null; clientId?: string | null;
  concept: string; notes?: string | null; status: string;
  amountUsd?: number | null; amountArs?: number | null; exchangeRate?: number | null;
  dueDate?: string | null; effectiveDate?: string | null;
};

export async function createIncomeBatch(entries: BatchEntry[]) {
  await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      const data = incomeSchema.parse(entry);
      const incomeType = await tx.incomeType.findUnique({
        where: { id: data.typeId },
        select: { requiresProject: true, isActive: true },
      });
      if (!incomeType) throw new Error("Tipo no encontrado.");
      if (!incomeType.isActive) throw new Error("El tipo seleccionado está inactivo.");
      if (incomeType.requiresProject && !data.projectId) {
        throw new Error(`El tipo requiere un proyecto asociado (${data.concept}).`);
      }
      if (data.status === "PENDING" && !data.dueDate) throw new Error("La fecha de vencimiento es obligatoria.");
      if (data.status === "PAID" && !data.effectiveDate) throw new Error("La fecha de cobro es obligatoria.");
      const money = computeMoney(data);
      await tx.income.create({
        data: {
          clientId: data.projectId ? (await tx.project.findUnique({ where: { id: data.projectId }, select: { clientId: true } }))?.clientId ?? data.clientId ?? null : data.clientId ?? null,
          projectId: data.projectId ?? null,
          typeId: data.typeId,
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
  revalidatePath("/incomes");
}

export async function bulkUpdateIncomes(ids: string[], updates: {
  typeId?: string; status?: string; statusDate?: string; amountUsd?: number; amountArs?: number; exchangeRate?: number; concept?: string;
}) {
  const data: Record<string, unknown> = {};
  if (updates.concept != null) {
    const trimmed = updates.concept.trim();
    if (!trimmed) throw new Error("El concepto no puede estar vacío.");
    data.concept = trimmed;
  }
  if (updates.typeId) data.typeId = updates.typeId;
  if (updates.status) {
    if (updates.status !== "PAID" && updates.status !== "PENDING") throw new Error("Estado no válido.");
    if (!updates.statusDate || !/^\d{4}-\d{2}-\d{2}$/.test(updates.statusDate)) {
      throw new Error("Indica la fecha correspondiente al nuevo estado.");
    }
    const statusDate = new Date(`${updates.statusDate}T00:00:00.000Z`);
    if (Number.isNaN(statusDate.getTime())) throw new Error("La fecha del nuevo estado no es válida.");
    data.status = updates.status;
    data.dueDate = updates.status === "PENDING" ? statusDate : null;
    data.effectiveDate = updates.status === "PAID" ? statusDate : null;
  }
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
  await prisma.income.updateMany({ where: { id: { in: ids } }, data });
  revalidatePath("/incomes");
}
