import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  MCP_DEFAULT_PAGE_SIZE,
  MCP_MAX_PAGE,
  MCP_MAX_RANGE_DAYS,
  MCP_MAX_RESULTS,
  MCP_REQUIRED_SCOPE,
} from "@/lib/mcp/config";
import {
  toPlanningTaskDto,
  toProjectAgreementDto,
  toClientSummaryDto,
  toFinancialSummaryDto,
  toFlowExpenseDto,
  toFlowIncomeDto,
  toProjectSummaryDto,
} from "@/server/mcp/dtos";
import { todayKeyArgentina, toUtcDate } from "@/lib/dates";
import { listClientsForMcp } from "@/server/services/clients";
import { getMcpFinancialSummary } from "@/server/services/dashboard";
import {
  listExpensesForMcp,
  listPendingExpensesForMcp,
} from "@/server/services/expenses";
import {
  listIncomesForMcp,
  listPendingIncomesForMcp,
} from "@/server/services/incomes";
import {
  getProjectDetailForMcp,
  getProjectPlanningForMcp,
  listProjectSummariesForMcp,
  listProjectsForMcp,
} from "@/server/services/projects";
import { registerWriteTools, WRITE_MCP_TOOL_NAMES } from "@/server/mcp/write-tools";
import { mcpErrorResult, requireMcpAdmin } from "@/server/mcp/identity";
import { registerOperationalTools, OPERATIONAL_MCP_READ_TOOL_NAMES } from "@/server/mcp/operational-tools";

export const MCP_TOOL_NAMES = [
  "resumen_financiero",
  "consultar_clientes",
  "consultar_proyectos",
  "flujo_fondos",
  "detalle_proyecto",
  "consultar_ingresos",
  "consultar_gastos",
  "planificacion_proyecto",
  "resumen_proyectos",
  ...OPERATIONAL_MCP_READ_TOOL_NAMES,
] as const;

export const MCP_TOOL_SECURITY_SCHEMES = [
  { type: "oauth2", scopes: [MCP_REQUIRED_SCOPE] },
] as const;

export { WRITE_MCP_TOOL_NAMES };

const DAY_MS = 86_400_000;

function isRealIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 1900 &&
    year <= 2100 &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato YYYY-MM-DD")
  .refine(isRealIsoDate, "Fecha calendario inválida");

const pageFields = {
  pagina: z.number().int().min(1).max(MCP_MAX_PAGE).default(1),
  limite: z
    .number()
    .int()
    .min(1)
    .max(MCP_MAX_RESULTS)
    .default(MCP_DEFAULT_PAGE_SIZE),
};

function withValidRange<T extends z.ZodRawShape>(shape: T) {
  return z
    .object({ desde: isoDateSchema, hasta: isoDateSchema, ...shape })
    .strict()
    .superRefine((value, context) => {
      const range = value as { desde: string; hasta: string };
      validateRange(range.desde, range.hasta, context);
    });
}

function validateRange(
  desde: string,
  hasta: string,
  context: z.RefinementCtx,
) {
  const from = Date.parse(`${desde}T00:00:00Z`);
  const to = Date.parse(`${hasta}T00:00:00Z`);
  if (from > to) {
    context.addIssue({
      code: "custom",
      path: ["hasta"],
      message: "La fecha hasta no puede ser anterior a desde",
    });
  } else if ((to - from) / DAY_MS + 1 > MCP_MAX_RANGE_DAYS) {
    context.addIssue({
      code: "custom",
      path: ["hasta"],
      message: `El rango máximo es de ${MCP_MAX_RANGE_DAYS} días`,
    });
  }
}

function withOptionalRange<T extends z.ZodRawShape>(shape: T) {
  return z
    .object({
      desde: isoDateSchema.optional(),
      hasta: isoDateSchema.optional(),
      ...shape,
    })
    .strict()
    .superRefine((value, context) => {
      const range = value as { desde?: string; hasta?: string };
      if ((range.desde === undefined) !== (range.hasta === undefined)) {
        context.addIssue({
          code: "custom",
          path: [range.desde === undefined ? "desde" : "hasta"],
          message: "Desde y hasta deben enviarse juntos",
        });
      } else if (range.desde && range.hasta) {
        validateRange(range.desde, range.hasta, context);
      }
    });
}

export const financialSummaryInputSchema = withValidRange({});
export const clientsInputSchema = z
  .object({
    texto: z.string().trim().min(1).max(100).optional(),
    ...pageFields,
  })
  .strict();
export const projectsInputSchema = z
  .object({
    texto: z.string().trim().min(1).max(100).optional(),
    clientId: z.string().uuid().optional(),
    activo: z.boolean().optional(),
    ...pageFields,
  })
  .strict();
export const cashFlowInputSchema = withValidRange(pageFields);
export const incomesInputSchema = withOptionalRange({
  incomeId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  estado: z.enum(["PAID", "PENDING", "OVERDUE"]).optional(),
  tipo: z.string().trim().min(1).max(100).optional(),
  ...pageFields,
});
export const expensesInputSchema = withOptionalRange({
  expenseId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  categoria: z.string().trim().min(1).max(100).optional(),
  estado: z.enum(["PAID", "PENDING", "OVERDUE"]).optional(),
  tipo: z.enum(["FIXED", "VARIABLE"]).optional(),
  ...pageFields,
});
export const projectDetailInputSchema = z
  .object({
    projectId: z.string().uuid(),
    paginaIngresos: pageFields.pagina,
    paginaGastos: pageFields.pagina,
    limiteMovimientos: pageFields.limite,
  })
  .strict();
export const projectPlanningInputSchema = z
  .object({ projectId: z.string().uuid(), ...pageFields })
  .strict();
export const projectSummariesInputSchema = projectsInputSchema;

const amountGroupSchema = z
  .object({ cantidad: z.number().int().nonnegative(), totalUsd: z.number() })
  .strict();
const financialSummaryOutputSchema = z
  .object({
    ingresosCobrados: amountGroupSchema,
    gastosPagados: amountGroupSchema,
    netoCobradoUsd: z.number(),
    ingresosPendientes: amountGroupSchema,
    gastosPendientes: amountGroupSchema,
    ingresosVencidos: amountGroupSchema,
    gastosVencidos: amountGroupSchema,
  })
  .strict();
const pageMetadataSchema = {
  pagina: z.number().int().positive(),
  limite: z.number().int().positive(),
  hayMas: z.boolean(),
};
const clientSchema = z
  .object({
    id: z.string(),
    nombre: z.string(),
    cantidadProyectos: z.number().int().nonnegative(),
  })
  .strict();
const clientsOutputSchema = z
  .object({ ...pageMetadataSchema, clientes: z.array(clientSchema) })
  .strict();
const projectSchema = z
  .object({
    id: z.string(),
    nombre: z.string(),
    cliente: z.object({ id: z.string(), nombre: z.string() }).strict(),
    activo: z.boolean(),
    inicio: z.string().nullable(),
    fin: z.string().nullable(),
    importeUnicoUsd: z.number().nullable(),
    importeMensualUsd: z.number().nullable(),
    cantidadIngresos: z.number().int().nonnegative(),
    cantidadGastos: z.number().int().nonnegative(),
  })
  .strict();
const projectsOutputSchema = z
  .object({ ...pageMetadataSchema, proyectos: z.array(projectSchema) })
  .strict();
const currencySchema = z.enum(["USD", "ARS"]);
const financialStatusSchema = z.enum(["PAID", "PENDING"]);
const originalMoneySchema = {
  montoOriginal: z.number(),
  monedaOriginal: currencySchema,
  tipoCambio: z.number().nullable(),
  montoUsd: z.number(),
};
const flowIncomeSchema = z
  .object({
    id: z.string(),
    concepto: z.string(),
    tipoId: z.string(),
    tipo: z.string(),
    estado: financialStatusSchema,
    vencimiento: z.string().nullable(),
    fechaCobro: z.string().nullable(),
    ...originalMoneySchema,
    cliente: z.string().nullable(),
    clienteId: z.string().nullable(),
    proyecto: z.string().nullable(),
    proyectoId: z.string().nullable(),
    vencido: z.boolean(),
  })
  .strict();
const flowExpenseSchema = z
  .object({
    id: z.string(),
    concepto: z.string(),
    categoriaId: z.string(),
    vencimiento: z.string().nullable(),
    fechaPago: z.string().nullable(),
    estado: financialStatusSchema,
    tipo: z.enum(["FIXED", "VARIABLE"]),
    ...originalMoneySchema,
    categoria: z.string(),
    proyecto: z.string().nullable(),
    proyectoId: z.string().nullable(),
    vencido: z.boolean(),
  })
  .strict();
const flowSideSchema = <T extends z.ZodType>(item: T) =>
  z.object({ hayMas: z.boolean(), items: z.array(item) }).strict();
const cashFlowOutputSchema = z
  .object({
    pagina: z.number().int().positive(),
    limite: z.number().int().positive(),
    ingresos: flowSideSchema(flowIncomeSchema),
    gastos: flowSideSchema(flowExpenseSchema),
  })
  .strict();
const incomesOutputSchema = z
  .object({ ...pageMetadataSchema, ingresos: z.array(flowIncomeSchema) })
  .strict();
const expensesOutputSchema = z
  .object({ ...pageMetadataSchema, gastos: z.array(flowExpenseSchema) })
  .strict();
const agreementSchema = z.object(originalMoneySchema).strict().nullable();
const projectBasicSchema = z
  .object({
    id: z.string(),
    nombre: z.string(),
    cliente: z.object({ id: z.string(), nombre: z.string() }).strict(),
    activo: z.boolean(),
    inicio: z.string().nullable(),
    fin: z.string().nullable(),
    goLive: z.string().nullable(),
    importeUnico: agreementSchema,
    importeMensual: agreementSchema,
  })
  .strict();
const projectFinancialSchema = z
  .object({
    ingresos: z
      .object({
        total: amountGroupSchema,
        cobrados: amountGroupSchema,
        pendientes: amountGroupSchema,
        vencidos: amountGroupSchema,
      })
      .strict(),
    gastos: z
      .object({
        total: amountGroupSchema,
        pagados: amountGroupSchema,
        pendientes: amountGroupSchema,
        vencidos: amountGroupSchema,
      })
      .strict(),
    resultadoTotalUsd: z.number(),
    resultadoCobradoUsd: z.number(),
  })
  .strict();
const movementPageSchema = <T extends z.ZodType>(item: T, key: string) =>
  z
    .object({
      pagina: z.number().int().positive(),
      limite: z.number().int().positive(),
      hayMas: z.boolean(),
      [key]: z.array(item),
    })
    .strict();
const projectDetailOutputSchema = z
  .object({
    encontrado: z.boolean(),
    proyecto: projectBasicSchema.nullable(),
    resumenFinanciero: projectFinancialSchema.nullable(),
    ingresosPorTipo: z.array(
      z
        .object({
          tipoId: z.string(),
          tipo: z.string(),
          cantidad: z.number().int().nonnegative(),
          totalUsd: z.number(),
        })
        .strict(),
    ),
    ingresos: movementPageSchema(flowIncomeSchema, "ingresos").nullable(),
    gastos: movementPageSchema(flowExpenseSchema, "gastos").nullable(),
  })
  .strict();
const phaseSchema = z
  .object({ id: z.string(), nombre: z.string(), orden: z.number().int() })
  .strict();
const planningTaskSchema = z
  .object({
    id: z.string(),
    nombre: z.string(),
    descripcion: z.string().nullable(),
    tipo: z.enum(["TASK", "MILESTONE"]),
    estado: z.enum(["TODO", "IN_PROGRESS", "TO_REVIEW", "BLOCKED", "DONE"]),
    inicio: z.string(),
    fin: z.string(),
    orden: z.number().int(),
    fase: z.object({ id: z.string(), nombre: z.string() }).strict().nullable(),
    atrasada: z.boolean(),
    clientVisible: z.boolean(),
  })
  .strict();
const planningSummarySchema = z
  .object({
    cantidadTareas: z.number().int().nonnegative(),
    tareasCompletadas: z.number().int().nonnegative(),
    tareasPendientes: z.number().int().nonnegative(),
    tareasAtrasadas: z.number().int().nonnegative(),
    cantidadHitos: z.number().int().nonnegative(),
    avancePorcentaje: z.number().int().min(0).max(100).nullable(),
  })
  .strict();
const projectPlanningOutputSchema = z
  .object({
    encontrado: z.boolean(),
    proyecto: projectBasicSchema.omit({ importeUnico: true, importeMensual: true }).nullable(),
    resumen: planningSummarySchema.nullable(),
    fases: z.array(phaseSchema),
    fasesHayMas: z.boolean(),
    pagina: z.number().int().positive(),
    limite: z.number().int().positive(),
    tareasHayMas: z.boolean(),
    tareas: z.array(planningTaskSchema),
  })
  .strict();
const projectPortfolioSchema = projectBasicSchema.extend({
  resumenFinanciero: projectFinancialSchema,
  planificacion: planningSummarySchema,
}).strict();
const projectSummariesOutputSchema = z
  .object({ ...pageMetadataSchema, proyectos: z.array(projectPortfolioSchema) })
  .strict();

export type McpReadServices = {
  financialSummary: typeof getMcpFinancialSummary;
  clients: typeof listClientsForMcp;
  projects: typeof listProjectsForMcp;
  incomes: typeof listPendingIncomesForMcp;
  expenses: typeof listPendingExpensesForMcp;
  incomeList: typeof listIncomesForMcp;
  expenseList: typeof listExpensesForMcp;
  projectDetail: typeof getProjectDetailForMcp;
  projectPlanning: typeof getProjectPlanningForMcp;
  projectSummaries: typeof listProjectSummariesForMcp;
};

const defaultServices: McpReadServices = {
  financialSummary: getMcpFinancialSummary,
  clients: listClientsForMcp,
  projects: listProjectsForMcp,
  incomes: listPendingIncomesForMcp,
  expenses: listPendingExpensesForMcp,
  incomeList: listIncomesForMcp,
  expenseList: listExpensesForMcp,
  projectDetail: getProjectDetailForMcp,
  projectPlanning: getProjectPlanningForMcp,
  projectSummaries: listProjectSummariesForMcp,
};

function utcDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function paging(pagina: number, limite: number) {
  return { skip: (pagina - 1) * limite, take: limite + 1 };
}

function todayUtc() {
  return toUtcDate(todayKeyArgentina());
}

function amountGroup(input: { _sum: { amountUsd: unknown }; _count: number }) {
  return {
    cantidad: input._count,
    totalUsd: Number(input._sum.amountUsd ?? 0),
  };
}

function projectBasic(project: {
  id: string;
  name: string;
  isActive: boolean;
  startDate: Date | string | null;
  endDate: Date | string | null;
  goLiveDate: Date | string | null;
  oneTimeOriginalAmount?: unknown | null;
  oneTimeCurrency?: "USD" | "ARS" | null;
  oneTimeExchangeRate?: unknown | null;
  oneTimeAmountUsd?: unknown | null;
  monthlyRecurringOriginalAmount?: unknown | null;
  monthlyRecurringCurrency?: "USD" | "ARS" | null;
  monthlyRecurringExchangeRate?: unknown | null;
  monthlyRecurringAmountUsd?: unknown | null;
  client: { id: string; name: string };
}) {
  return {
    id: project.id,
    nombre: project.name,
    cliente: { id: project.client.id, nombre: project.client.name },
    activo: project.isActive,
    inicio: project.startDate
      ? new Date(project.startDate).toISOString().slice(0, 10)
      : null,
    fin: project.endDate
      ? new Date(project.endDate).toISOString().slice(0, 10)
      : null,
    goLive: project.goLiveDate
      ? new Date(project.goLiveDate).toISOString().slice(0, 10)
      : null,
    importeUnico: toProjectAgreementDto({
      originalAmount: project.oneTimeOriginalAmount ?? null,
      currency: project.oneTimeCurrency ?? null,
      exchangeRate: project.oneTimeExchangeRate ?? null,
      amountUsd: project.oneTimeAmountUsd ?? null,
    }),
    importeMensual: toProjectAgreementDto({
      originalAmount: project.monthlyRecurringOriginalAmount ?? null,
      currency: project.monthlyRecurringCurrency ?? null,
      exchangeRate: project.monthlyRecurringExchangeRate ?? null,
      amountUsd: project.monthlyRecurringAmountUsd ?? null,
    }),
  };
}

function financialSummary(input: {
  incomeAll: { _sum: { amountUsd: unknown }; _count: number };
  incomePaid: { _sum: { amountUsd: unknown }; _count: number };
  incomePending: { _sum: { amountUsd: unknown }; _count: number };
  incomeOverdue: { _sum: { amountUsd: unknown }; _count: number };
  expenseAll: { _sum: { amountUsd: unknown }; _count: number };
  expensePaid: { _sum: { amountUsd: unknown }; _count: number };
  expensePending: { _sum: { amountUsd: unknown }; _count: number };
  expenseOverdue: { _sum: { amountUsd: unknown }; _count: number };
}) {
  const incomes = {
    total: amountGroup(input.incomeAll),
    cobrados: amountGroup(input.incomePaid),
    pendientes: amountGroup(input.incomePending),
    vencidos: amountGroup(input.incomeOverdue),
  };
  const expenses = {
    total: amountGroup(input.expenseAll),
    pagados: amountGroup(input.expensePaid),
    pendientes: amountGroup(input.expensePending),
    vencidos: amountGroup(input.expenseOverdue),
  };
  return {
    ingresos: incomes,
    gastos: expenses,
    resultadoTotalUsd: incomes.total.totalUsd - expenses.total.totalUsd,
    resultadoCobradoUsd:
      incomes.cobrados.totalUsd - expenses.pagados.totalUsd,
  };
}

export async function getFinancialSummary(
  rawInput: unknown,
  services: McpReadServices = defaultServices,
) {
  const input = financialSummaryInputSchema.parse(rawInput);
  const data = await services.financialSummary(
    utcDate(input.desde),
    utcDate(input.hasta),
  );
  return toFinancialSummaryDto(data);
}

export async function getClients(
  rawInput: unknown,
  services: McpReadServices = defaultServices,
) {
  const input = clientsInputSchema.parse(rawInput);
  const rows = await services.clients({
    search: input.texto,
    ...paging(input.pagina, input.limite),
  });
  return {
    pagina: input.pagina,
    limite: input.limite,
    hayMas: rows.length > input.limite,
    clientes: rows.slice(0, input.limite).map(toClientSummaryDto),
  };
}

export async function getProjects(
  rawInput: unknown,
  services: McpReadServices = defaultServices,
) {
  const input = projectsInputSchema.parse(rawInput);
  const rows = await services.projects({
    search: input.texto,
    clientId: input.clientId,
    isActive: input.activo,
    ...paging(input.pagina, input.limite),
  });
  return {
    pagina: input.pagina,
    limite: input.limite,
    hayMas: rows.length > input.limite,
    proyectos: rows.slice(0, input.limite).map(toProjectSummaryDto),
  };
}

export async function getCashFlow(
  rawInput: unknown,
  services: McpReadServices = defaultServices,
) {
  const input = cashFlowInputSchema.parse(rawInput);
  const today = todayUtc();
  const range = {
    from: utcDate(input.desde),
    to: utcDate(input.hasta),
    ...paging(input.pagina, input.limite),
  };
  const [incomes, expenses] = await Promise.all([
    services.incomes(range),
    services.expenses(range),
  ]);
  return {
    pagina: input.pagina,
    limite: input.limite,
    ingresos: {
      hayMas: incomes.length > input.limite,
      items: incomes
        .slice(0, input.limite)
        .map((income) => toFlowIncomeDto(income, today)),
    },
    gastos: {
      hayMas: expenses.length > input.limite,
      items: expenses
        .slice(0, input.limite)
        .map((expense) => toFlowExpenseDto(expense, today)),
    },
  };
}

export async function getIncomes(
  rawInput: unknown,
  services: McpReadServices = defaultServices,
) {
  const input = incomesInputSchema.parse(rawInput);
  const today = todayUtc();
  const rows = await services.incomeList({
    ...(input.desde && input.hasta
      ? { from: utcDate(input.desde), to: utcDate(input.hasta) }
      : {}),
    projectId: input.projectId,
    incomeId: input.incomeId,
    clientId: input.clientId,
    status: input.estado,
    typeName: input.tipo,
    today,
    ...paging(input.pagina, input.limite),
  });
  return {
    pagina: input.pagina,
    limite: input.limite,
    hayMas: rows.length > input.limite,
    ingresos: rows
      .slice(0, input.limite)
      .map((income) => toFlowIncomeDto(income, today)),
  };
}

export async function getExpenses(
  rawInput: unknown,
  services: McpReadServices = defaultServices,
) {
  const input = expensesInputSchema.parse(rawInput);
  const today = todayUtc();
  const rows = await services.expenseList({
    ...(input.desde && input.hasta
      ? { from: utcDate(input.desde), to: utcDate(input.hasta) }
      : {}),
    projectId: input.projectId,
    expenseId: input.expenseId,
    categoryName: input.categoria,
    status: input.estado,
    type: input.tipo,
    today,
    ...paging(input.pagina, input.limite),
  });
  return {
    pagina: input.pagina,
    limite: input.limite,
    hayMas: rows.length > input.limite,
    gastos: rows
      .slice(0, input.limite)
      .map((expense) => toFlowExpenseDto(expense, today)),
  };
}

export async function getProjectDetail(
  rawInput: unknown,
  services: McpReadServices = defaultServices,
) {
  const input = projectDetailInputSchema.parse(rawInput);
  const today = todayUtc();
  const detail = await services.projectDetail(input.projectId, today);
  if (!detail) {
    return {
      encontrado: false,
      proyecto: null,
      resumenFinanciero: null,
      ingresosPorTipo: [],
      ingresos: null,
      gastos: null,
    };
  }

  const [incomeRows, expenseRows] = await Promise.all([
    services.incomeList({
      projectId: input.projectId,
      today,
      ...paging(input.paginaIngresos, input.limiteMovimientos),
    }),
    services.expenseList({
      projectId: input.projectId,
      today,
      ...paging(input.paginaGastos, input.limiteMovimientos),
    }),
  ]);
  const typeNames = new Map(
    detail.incomeTypes.map((type) => [type.id, type.name]),
  );

  return {
    encontrado: true,
    proyecto: projectBasic(detail.project),
    resumenFinanciero: financialSummary(detail),
    ingresosPorTipo: detail.incomeByType.flatMap((group) => {
      const typeName = typeNames.get(group.typeId);
      return typeName
        ? [
            {
              tipoId: group.typeId,
              tipo: typeName,
              cantidad: group._count,
              totalUsd: Number(group._sum.amountUsd ?? 0),
            },
          ]
        : [];
    }),
    ingresos: {
      pagina: input.paginaIngresos,
      limite: input.limiteMovimientos,
      hayMas: incomeRows.length > input.limiteMovimientos,
      ingresos: incomeRows
        .slice(0, input.limiteMovimientos)
        .map((income) => toFlowIncomeDto(income, today)),
    },
    gastos: {
      pagina: input.paginaGastos,
      limite: input.limiteMovimientos,
      hayMas: expenseRows.length > input.limiteMovimientos,
      gastos: expenseRows
        .slice(0, input.limiteMovimientos)
        .map((expense) => toFlowExpenseDto(expense, today)),
    },
  };
}

function planningSummary(
  groups: Array<{
    type: "TASK" | "MILESTONE";
    status: "TODO" | "IN_PROGRESS" | "TO_REVIEW" | "BLOCKED" | "DONE";
    _count: number;
  }>,
  overdueTasks: number,
) {
  const tasks = groups.filter((group) => group.type === "TASK");
  const totalTasks = tasks.reduce((sum, group) => sum + group._count, 0);
  const doneTasks = tasks
    .filter((group) => group.status === "DONE")
    .reduce((sum, group) => sum + group._count, 0);
  return {
    cantidadTareas: totalTasks,
    tareasCompletadas: doneTasks,
    tareasPendientes: totalTasks - doneTasks,
    tareasAtrasadas: overdueTasks,
    cantidadHitos: groups
      .filter((group) => group.type === "MILESTONE")
      .reduce((sum, group) => sum + group._count, 0),
    avancePorcentaje:
      totalTasks === 0 ? null : Math.round((doneTasks / totalTasks) * 100),
  };
}

export async function getProjectPlanning(
  rawInput: unknown,
  services: McpReadServices = defaultServices,
) {
  const input = projectPlanningInputSchema.parse(rawInput);
  const today = todayUtc();
  const planning = await services.projectPlanning({
    projectId: input.projectId,
    today,
    phaseTake: MCP_MAX_RESULTS + 1,
    ...paging(input.pagina, input.limite),
  });
  if (!planning) {
    return {
      encontrado: false,
      proyecto: null,
      resumen: null,
      fases: [],
      fasesHayMas: false,
      pagina: input.pagina,
      limite: input.limite,
      tareasHayMas: false,
      tareas: [],
    };
  }

  const basic = projectBasic(planning.project);
  const { importeUnico: _oneTime, importeMensual: _monthly, ...project } = basic;
  return {
    encontrado: true,
    proyecto: project,
    resumen: planningSummary(planning.taskGroups, planning.overdueTasks),
    fases: planning.project.phases.slice(0, MCP_MAX_RESULTS).map((phase) => ({
      id: phase.id,
      nombre: phase.name,
      orden: phase.position,
    })),
    fasesHayMas: planning.project.phases.length > MCP_MAX_RESULTS,
    pagina: input.pagina,
    limite: input.limite,
    tareasHayMas: planning.project.tasks.length > input.limite,
    tareas: planning.project.tasks
      .slice(0, input.limite)
      .map((task) => toPlanningTaskDto(task, today)),
  };
}

export async function getProjectSummaries(
  rawInput: unknown,
  services: McpReadServices = defaultServices,
) {
  const input = projectSummariesInputSchema.parse(rawInput);
  const today = todayUtc();
  const rows = await services.projectSummaries({
    search: input.texto,
    clientId: input.clientId,
    isActive: input.activo,
    today,
    ...paging(input.pagina, input.limite),
  });

  return {
    pagina: input.pagina,
    limite: input.limite,
    hayMas: rows.length > input.limite,
    proyectos: rows.slice(0, input.limite).map((row) => {
      const income = (status?: "PAID" | "PENDING") => {
        const groups = status
          ? row.incomeGroups.filter((group) => group.status === status)
          : row.incomeGroups;
        return {
          _sum: {
            amountUsd: groups.reduce(
              (sum, group) => sum + Number(group._sum.amountUsd ?? 0),
              0,
            ),
          },
          _count: groups.reduce((sum, group) => sum + group._count, 0),
        };
      };
      const expense = (status?: "PAID" | "PENDING") => {
        const groups = status
          ? row.expenseGroups.filter((group) => group.status === status)
          : row.expenseGroups;
        return {
          _sum: {
            amountUsd: groups.reduce(
              (sum, group) => sum + Number(group._sum.amountUsd ?? 0),
              0,
            ),
          },
          _count: groups.reduce((sum, group) => sum + group._count, 0),
        };
      };
      const empty = { _sum: { amountUsd: 0 }, _count: 0 };
      return {
        ...projectBasic(row.project),
        resumenFinanciero: financialSummary({
          incomeAll: income(),
          incomePaid: income("PAID"),
          incomePending: income("PENDING"),
          incomeOverdue: row.overdueIncome ?? empty,
          expenseAll: expense(),
          expensePaid: expense("PAID"),
          expensePending: expense("PENDING"),
          expenseOverdue: row.overdueExpense ?? empty,
        }),
        planificacion: planningSummary(row.taskGroups, row.overdueTasks),
      };
    }),
  };
}

const toolMetadata = {
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  _meta: {
    // Legacy/client-specific mirror. The HTTP transport also exposes this at
    // the tool level because the installed MCP SDK only serializes `_meta`.
    securitySchemes: MCP_TOOL_SECURITY_SCHEMES,
  },
};

function result(data: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

export function registerTools(
  server: McpServer,
  services: McpReadServices = defaultServices,
  options: { writeEnabled?: boolean } = {},
) {
  const adminRead = <T>(fn: (input: T) => Promise<Record<string, unknown>>) =>
    async (input: T, ctx: Parameters<typeof requireMcpAdmin>[0]) => {
      try {
        await requireMcpAdmin(ctx);
        return result(await fn(input));
      } catch (error) {
        return mcpErrorResult(error);
      }
    };
  server.registerTool(
    "resumen_financiero",
    {
      title: "Resumen financiero",
      description:
        "Totales agregados de ingresos, gastos y vencidos para un período de hasta 366 días.",
      inputSchema: financialSummaryInputSchema,
      outputSchema: financialSummaryOutputSchema,
      ...toolMetadata,
    },
    adminRead((input) => getFinancialSummary(input, services)),
  );

  server.registerTool(
    "consultar_clientes",
    {
      title: "Consultar clientes",
      description:
        "Lista paginada de clientes por nombre; no devuelve contactos ni notas internas.",
      inputSchema: clientsInputSchema,
      outputSchema: clientsOutputSchema,
      ...toolMetadata,
    },
    adminRead((input) => getClients(input, services)),
  );

  server.registerTool(
    "consultar_proyectos",
    {
      title: "Consultar proyectos",
      description:
        "Lista paginada de proyectos por nombre, cliente o estado, sin notas ni enlaces privados.",
      inputSchema: projectsInputSchema,
      outputSchema: projectsOutputSchema,
      ...toolMetadata,
    },
    adminRead((input) => getProjects(input, services)),
  );

  server.registerTool(
    "flujo_fondos",
    {
      title: "Flujo de fondos",
      description:
        "Ingresos y gastos pendientes, paginados y acotados a un rango máximo de 366 días.",
      inputSchema: cashFlowInputSchema,
      outputSchema: cashFlowOutputSchema,
      ...toolMetadata,
    },
    adminRead((input) => getCashFlow(input, services)),
  );

  server.registerTool(
    "detalle_proyecto",
    {
      title: "Detalle de proyecto",
      description:
        "Visión completa y acotada de un proyecto: importes acordados, resumen financiero, ingresos por tipo y movimientos relacionados.",
      inputSchema: projectDetailInputSchema,
      outputSchema: projectDetailOutputSchema,
      ...toolMetadata,
    },
    adminRead((input) => getProjectDetail(input, services)),
  );

  server.registerTool(
    "consultar_ingresos",
    {
      title: "Consultar ingresos",
      description:
        "Lista paginada de ingresos con filtros por fecha de negocio, proyecto, cliente, estado y tipo.",
      inputSchema: incomesInputSchema,
      outputSchema: incomesOutputSchema,
      ...toolMetadata,
    },
    adminRead((input) => getIncomes(input, services)),
  );

  server.registerTool(
    "consultar_gastos",
    {
      title: "Consultar gastos",
      description:
        "Lista paginada de gastos con filtros por fecha de negocio, proyecto, categoría, estado y tipo fijo o variable.",
      inputSchema: expensesInputSchema,
      outputSchema: expensesOutputSchema,
      ...toolMetadata,
    },
    adminRead((input) => getExpenses(input, services)),
  );

  server.registerTool(
    "planificacion_proyecto",
    {
      title: "Planificación de proyecto",
      description:
        "Consulta fases, tareas, hitos, estados, fechas, orden, atrasos y avance de un proyecto sin datos de acceso.",
      inputSchema: projectPlanningInputSchema,
      outputSchema: projectPlanningOutputSchema,
      ...toolMetadata,
    },
    adminRead((input) => getProjectPlanning(input, services)),
  );

  server.registerTool(
    "resumen_proyectos",
    {
      title: "Resumen de proyectos",
      description:
        "Resumen paginado de proyectos con cliente, fechas, importes, finanzas y estado de planificación.",
      inputSchema: projectSummariesInputSchema,
      outputSchema: projectSummariesOutputSchema,
      ...toolMetadata,
    },
    adminRead((input) => getProjectSummaries(input, services)),
  );

  registerOperationalTools(server, { writeEnabled: options.writeEnabled });
  if (options.writeEnabled) registerWriteTools(server);
}
