import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const D = Prisma.Decimal;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const currencySchema = z.enum(["USD", "ARS"]);

const oneTimeSchema = z
  .object({
    oneTimeOriginalAmount: z.number().nullable().optional(),
    oneTimeCurrency: currencySchema.nullable().optional(),
    oneTimeExchangeRate: z.number().nullable().optional(),
  })
  .optional();

const monthlySchema = z
  .object({
    monthlyRecurringOriginalAmount: z.number().nullable().optional(),
    monthlyRecurringCurrency: currencySchema.nullable().optional(),
    monthlyRecurringExchangeRate: z.number().nullable().optional(),
  })
  .optional();

export const projectInputSchema = z.object({
  clientId: z.string().min(1, "El cliente es obligatorio."),
  name: z.string().trim().min(1, "El nombre es obligatorio."),
  isActive: z.boolean().default(true),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  goLiveDate: z.string().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  oneTimeOriginalAmount: z.number().nullable().optional(),
  oneTimeCurrency: currencySchema.nullable().optional(),
  oneTimeExchangeRate: z.number().nullable().optional(),
  monthlyRecurringOriginalAmount: z.number().nullable().optional(),
  monthlyRecurringCurrency: currencySchema.nullable().optional(),
  monthlyRecurringExchangeRate: z.number().nullable().optional(),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;

// ---------------------------------------------------------------------------
// Decimal helpers
// ---------------------------------------------------------------------------

function toDec(v: number): Prisma.Decimal {
  return new D(v);
}

function computeOneTimeAmounts(input: {
  oneTimeOriginalAmount?: number | null;
  oneTimeCurrency?: "USD" | "ARS" | null;
  oneTimeExchangeRate?: number | null;
}) {
  const amt = input.oneTimeOriginalAmount;
  if (amt == null) {
    return {
      oneTimeOriginalAmount: null,
      oneTimeCurrency: null,
      oneTimeExchangeRate: null,
      oneTimeAmountUsd: null,
    };
  }

  if (amt <= 0) throw new Error("El importe acordado debe ser mayor que cero.");

  if (input.oneTimeCurrency === "USD") {
    if (input.oneTimeExchangeRate != null) {
      throw new Error("Un proyecto en USD no debe tener tipo de cambio.");
    }
    const usd = toDec(amt);
    return {
      oneTimeOriginalAmount: usd,
      oneTimeCurrency: "USD" as const,
      oneTimeExchangeRate: null,
      oneTimeAmountUsd: usd,
    };
  }

  if (input.oneTimeCurrency === "ARS") {
    if (!input.oneTimeExchangeRate || input.oneTimeExchangeRate <= 0) {
      throw new Error("Un proyecto en ARS requiere tipo de cambio mayor que cero.");
    }
    const rate = toDec(input.oneTimeExchangeRate);
    const usd = toDec(amt).dividedBy(rate).toFixed(6);
    return {
      oneTimeOriginalAmount: toDec(amt),
      oneTimeCurrency: "ARS" as const,
      oneTimeExchangeRate: rate,
      oneTimeAmountUsd: new D(usd),
    };
  }

  throw new Error("Moneda invalida. Usa USD o ARS.");
}

function computeMonthlyAmounts(input: {
  monthlyRecurringOriginalAmount?: number | null;
  monthlyRecurringCurrency?: "USD" | "ARS" | null;
  monthlyRecurringExchangeRate?: number | null;
}) {
  const amt = input.monthlyRecurringOriginalAmount;
  if (amt == null) {
    return {
      monthlyRecurringOriginalAmount: null,
      monthlyRecurringCurrency: null,
      monthlyRecurringExchangeRate: null,
      monthlyRecurringAmountUsd: null,
    };
  }

  if (amt <= 0) throw new Error("El importe mensual debe ser mayor que cero.");

  if (input.monthlyRecurringCurrency === "USD") {
    if (input.monthlyRecurringExchangeRate != null) {
      throw new Error("Un proyecto en USD no debe tener tipo de cambio.");
    }
    const usd = toDec(amt);
    return {
      monthlyRecurringOriginalAmount: usd,
      monthlyRecurringCurrency: "USD" as const,
      monthlyRecurringExchangeRate: null,
      monthlyRecurringAmountUsd: usd,
    };
  }

  if (input.monthlyRecurringCurrency === "ARS") {
    if (!input.monthlyRecurringExchangeRate || input.monthlyRecurringExchangeRate <= 0) {
      throw new Error("Un proyecto en ARS requiere tipo de cambio mayor que cero.");
    }
    const rate = toDec(input.monthlyRecurringExchangeRate);
    const usd = toDec(amt).dividedBy(rate).toFixed(6);
    return {
      monthlyRecurringOriginalAmount: toDec(amt),
      monthlyRecurringCurrency: "ARS" as const,
      monthlyRecurringExchangeRate: rate,
      monthlyRecurringAmountUsd: new D(usd),
    };
  }

  throw new Error("Moneda invalida. Usa USD o ARS.");
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listProjects(filters?: {
  clientId?: string;
  isActive?: boolean;
}) {
  const where: Record<string, unknown> = {};
  if (filters?.clientId) where.clientId = filters.clientId;
  if (filters?.isActive !== undefined) where.isActive = filters.isActive;

  return prisma.project.findMany({
    where,
    select: {
      id: true,
      name: true,
      clientId: true,
      isActive: true,
      startDate: true,
      endDate: true,
      oneTimeOriginalAmount: true,
      oneTimeCurrency: true,
      oneTimeAmountUsd: true,
      monthlyRecurringOriginalAmount: true,
      monthlyRecurringCurrency: true,
      monthlyRecurringAmountUsd: true,
      client: { select: { id: true, name: true } },
      _count: { select: { incomes: true, expenses: true } },
    },
    orderBy: [{ isActive: "desc" }, { client: { name: "asc" } }, { name: "asc" }],
  });
}

export async function listProjectsForMcp(input: {
  search?: string;
  clientId?: string;
  isActive?: boolean;
  skip: number;
  take: number;
}) {
  return prisma.project.findMany({
    where: {
      ...(input.search
        ? { name: { contains: input.search, mode: "insensitive" as const } }
        : {}),
      ...(input.clientId ? { clientId: input.clientId } : {}),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    },
    select: {
      id: true,
      name: true,
      isActive: true,
      startDate: true,
      endDate: true,
      oneTimeAmountUsd: true,
      monthlyRecurringAmountUsd: true,
      client: { select: { id: true, name: true } },
      _count: { select: { incomes: true, expenses: true } },
    },
    orderBy: [
      { isActive: "desc" },
      { client: { name: "asc" } },
      { name: "asc" },
      { id: "asc" },
    ],
    skip: input.skip,
    take: input.take,
  });
}

export async function getProjectDetailForMcp(id: string, today: Date) {
  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      isActive: true,
      startDate: true,
      endDate: true,
      goLiveDate: true,
      oneTimeOriginalAmount: true,
      oneTimeCurrency: true,
      oneTimeExchangeRate: true,
      oneTimeAmountUsd: true,
      monthlyRecurringOriginalAmount: true,
      monthlyRecurringCurrency: true,
      monthlyRecurringExchangeRate: true,
      monthlyRecurringAmountUsd: true,
      client: { select: { id: true, name: true } },
    },
  });
  if (!project) return null;

  const [
    incomeGroups,
    incomeOverdue,
    expenseGroups,
    expenseOverdue,
    incomeTypes,
  ] = await Promise.all([
    prisma.income.groupBy({
      by: ["status", "typeId"],
      where: { projectId: id },
      _sum: { amountUsd: true },
      _count: true,
    }),
    prisma.income.aggregate({
      where: { projectId: id, status: "PENDING", dueDate: { lt: today } },
      _sum: { amountUsd: true },
      _count: true,
    }),
    prisma.expense.groupBy({
      by: ["status"],
      where: { projectId: id },
      _sum: { amountUsd: true },
      _count: true,
    }),
    prisma.expense.aggregate({
      where: { projectId: id, status: "PENDING", dueDate: { lt: today } },
      _sum: { amountUsd: true },
      _count: true,
    }),
    prisma.incomeType.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const amountAggregate = (
    groups: Array<{
      _sum: { amountUsd: Prisma.Decimal | null };
      _count: number;
    }>,
  ) => {
    const count = groups.reduce((sum, group) => sum + group._count, 0);
    const amountUsd = groups.reduce(
      (sum, group) => sum.plus(group._sum.amountUsd ?? 0),
      new D(0),
    );
    return { _sum: { amountUsd: count === 0 ? null : amountUsd }, _count: count };
  };
  const incomeByType = incomeTypes.map((type) => ({
    typeId: type.id,
    ...amountAggregate(incomeGroups.filter((group) => group.typeId === type.id)),
  })).filter((group) => group._count > 0);

  return {
    project,
    incomeAll: amountAggregate(incomeGroups),
    incomePaid: amountAggregate(
      incomeGroups.filter((group) => group.status === "PAID"),
    ),
    incomePending: amountAggregate(
      incomeGroups.filter((group) => group.status === "PENDING"),
    ),
    incomeOverdue,
    expenseAll: amountAggregate(expenseGroups),
    expensePaid: amountAggregate(
      expenseGroups.filter((group) => group.status === "PAID"),
    ),
    expensePending: amountAggregate(
      expenseGroups.filter((group) => group.status === "PENDING"),
    ),
    expenseOverdue,
    incomeByType,
    incomeTypes,
  };
}

export async function getProjectPlanningForMcp(input: {
  projectId: string;
  today: Date;
  skip: number;
  take: number;
  phaseTake: number;
}) {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: {
      id: true,
      name: true,
      isActive: true,
      startDate: true,
      endDate: true,
      goLiveDate: true,
      client: { select: { id: true, name: true } },
      phases: {
        select: { id: true, name: true, position: true },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        take: input.phaseTake,
      },
      tasks: {
        select: {
          id: true,
          name: true,
          description: true,
          type: true,
          startDate: true,
          endDate: true,
          status: true,
          position: true,
          clientVisible: true,
          phase: { select: { id: true, name: true } },
        },
        orderBy: [{ position: "asc" }, { startDate: "asc" }, { id: "asc" }],
        skip: input.skip,
        take: input.take,
      },
    },
  });
  if (!project) return null;

  const [taskGroups, overdueTasks] = await Promise.all([
    prisma.projectTask.groupBy({
      by: ["type", "status"],
      where: { projectId: input.projectId },
      _count: true,
    }),
    prisma.projectTask.count({
      where: {
        projectId: input.projectId,
        type: "TASK",
        status: { not: "DONE" },
        endDate: { lt: input.today },
      },
    }),
  ]);

  return { project, taskGroups, overdueTasks };
}

export async function listProjectSummariesForMcp(input: {
  search?: string;
  clientId?: string;
  isActive?: boolean;
  today: Date;
  skip: number;
  take: number;
}) {
  const projects = await prisma.project.findMany({
    where: {
      ...(input.search
        ? { name: { contains: input.search, mode: "insensitive" as const } }
        : {}),
      ...(input.clientId ? { clientId: input.clientId } : {}),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    },
    select: {
      id: true,
      name: true,
      isActive: true,
      startDate: true,
      endDate: true,
      goLiveDate: true,
      oneTimeOriginalAmount: true,
      oneTimeCurrency: true,
      oneTimeExchangeRate: true,
      oneTimeAmountUsd: true,
      monthlyRecurringOriginalAmount: true,
      monthlyRecurringCurrency: true,
      monthlyRecurringExchangeRate: true,
      monthlyRecurringAmountUsd: true,
      client: { select: { id: true, name: true } },
    },
    orderBy: [
      { isActive: "desc" },
      { client: { name: "asc" } },
      { name: "asc" },
      { id: "asc" },
    ],
    skip: input.skip,
    take: input.take,
  });

  const projectIds = projects.map((project) => project.id);
  if (projectIds.length === 0) return [];

  const [
    incomeGroups,
    expenseGroups,
    overdueIncomeGroups,
    overdueExpenseGroups,
    taskGroups,
    overdueTaskGroups,
  ] =
    await Promise.all([
      prisma.income.groupBy({
        by: ["projectId", "status"],
        where: { projectId: { in: projectIds } },
        _sum: { amountUsd: true },
        _count: true,
      }),
      prisma.expense.groupBy({
        by: ["projectId", "status"],
        where: { projectId: { in: projectIds } },
        _sum: { amountUsd: true },
        _count: true,
      }),
      prisma.income.groupBy({
        by: ["projectId"],
        where: {
          projectId: { in: projectIds },
          status: "PENDING",
          dueDate: { lt: input.today },
        },
        _sum: { amountUsd: true },
        _count: true,
      }),
      prisma.expense.groupBy({
        by: ["projectId"],
        where: {
          projectId: { in: projectIds },
          status: "PENDING",
          dueDate: { lt: input.today },
        },
        _sum: { amountUsd: true },
        _count: true,
      }),
      prisma.projectTask.groupBy({
        by: ["projectId", "type", "status"],
        where: { projectId: { in: projectIds } },
        _count: true,
      }),
      prisma.projectTask.groupBy({
        by: ["projectId"],
        where: {
          projectId: { in: projectIds },
          type: "TASK",
          status: { not: "DONE" },
          endDate: { lt: input.today },
        },
        _count: true,
      }),
    ]);

  return projects.map((project) => ({
    project,
    incomeGroups: incomeGroups.filter((group) => group.projectId === project.id),
    expenseGroups: expenseGroups.filter((group) => group.projectId === project.id),
    overdueIncome:
      overdueIncomeGroups.find((group) => group.projectId === project.id) ?? null,
    overdueExpense:
      overdueExpenseGroups.find((group) => group.projectId === project.id) ?? null,
    taskGroups: taskGroups.filter((group) => group.projectId === project.id),
    overdueTasks:
      overdueTaskGroups.find((group) => group.projectId === project.id)?._count ?? 0,
  }));
}

export async function getProject(id: string) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: true,
      _count: { select: { incomes: true, expenses: true } },
    },
  });
  if (!project) throw new Error("Proyecto no encontrado.");

  const [incAll, incPaid, incPending, expAll, expPaid, expPending] = await Promise.all([
    prisma.income.aggregate({ where: { projectId: id }, _sum: { amountUsd: true, amountArs: true } }),
    prisma.income.aggregate({ where: { projectId: id, status: "PAID" }, _sum: { amountUsd: true, amountArs: true } }),
    prisma.income.aggregate({ where: { projectId: id, status: "PENDING" }, _sum: { amountUsd: true, amountArs: true } }),
    prisma.expense.aggregate({ where: { projectId: id }, _sum: { amountUsd: true, amountArs: true } }),
    prisma.expense.aggregate({ where: { projectId: id, status: "PAID" }, _sum: { amountUsd: true, amountArs: true } }),
    prisma.expense.aggregate({ where: { projectId: id, status: "PENDING" }, _sum: { amountUsd: true, amountArs: true } }),
  ]);

  return {
    ...project,
    _incomeTotals: {
      all: incAll._sum.amountUsd ?? 0,
      paid: incPaid._sum.amountUsd ?? 0,
      pending: incPending._sum.amountUsd ?? 0,
      allArs: incAll._sum.amountArs ?? 0,
      paidArs: incPaid._sum.amountArs ?? 0,
      pendingArs: incPending._sum.amountArs ?? 0,
    },
    _expenseTotals: {
      all: expAll._sum.amountUsd ?? 0,
      paid: expPaid._sum.amountUsd ?? 0,
      pending: expPending._sum.amountUsd ?? 0,
      allArs: expAll._sum.amountArs ?? 0,
      paidArs: expPaid._sum.amountArs ?? 0,
      pendingArs: expPending._sum.amountArs ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createProject(input: ProjectInput) {
  const data = projectInputSchema.parse(input);
  const oneTime = computeOneTimeAmounts(data);
  const monthly = computeMonthlyAmounts(data);

  // Validate startDate <= endDate
  if (data.startDate && data.endDate && data.startDate > data.endDate) {
    throw new Error("La fecha de fin no puede ser anterior a la fecha de inicio.");
  }

  try {
    const project = await prisma.project.create({
      data: {
        clientId: data.clientId,
        name: data.name,
        isActive: data.isActive,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        goLiveDate: data.goLiveDate ? new Date(data.goLiveDate) : null,
        notes: data.notes?.trim() || null,
        ...oneTime,
        ...monthly,
      },
    });
    revalidatePath("/projects");
    return project;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      throw new Error(
        "Ya existe un proyecto con ese nombre para este cliente.",
      );
    }
    throw error;
  }
}

export async function updateProject(id: string, input: ProjectInput) {
  const data = projectInputSchema.parse(input);
  const existing = await prisma.project.findUnique({
    where: { id },
    select: { clientId: true, _count: { select: { incomes: true, expenses: true, timeEntries: true } } },
  });
  if (!existing) throw new Error("Proyecto no encontrado.");

  // Block client change if project has movements
  if (data.clientId !== existing.clientId) {
    const hasMovements =
      existing._count.incomes > 0 || existing._count.expenses > 0 || existing._count.timeEntries > 0;
    if (hasMovements) {
      throw new Error(
        "No se puede cambiar el cliente porque el proyecto tiene movimientos asociados.",
      );
    }
  }

  const oneTime = computeOneTimeAmounts(data);
  const monthly = computeMonthlyAmounts(data);

  if (data.startDate && data.endDate && data.startDate > data.endDate) {
    throw new Error("La fecha de fin no puede ser anterior a la fecha de inicio.");
  }

  try {
    const project = await prisma.project.update({
      where: { id },
      data: {
        clientId: data.clientId,
        name: data.name,
        isActive: data.isActive,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        goLiveDate: data.goLiveDate ? new Date(data.goLiveDate) : null,
        notes: data.notes?.trim() || null,
        ...oneTime,
        ...monthly,
      },
    });
    revalidatePath("/projects");
    revalidatePath(`/projects/${id}`);
    return project;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      throw new Error(
        "Ya existe un proyecto con ese nombre para este cliente.",
      );
    }
    throw error;
  }
}

export async function deleteProject(id: string) {
  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      _count: { select: { incomes: true, expenses: true, timeEntries: true } },
    },
  });
  if (!project) throw new Error("Proyecto no encontrado.");

  if (project._count.incomes > 0 || project._count.expenses > 0 || project._count.timeEntries > 0) {
    throw new Error(
      "No se puede eliminar el proyecto porque tiene movimientos asociados.",
    );
  }

  await prisma.project.delete({ where: { id } });
  revalidatePath("/projects");
}
