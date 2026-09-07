function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function date(value: Date | string | null): string | null {
  if (!value) return null;
  return (value instanceof Date ? value.toISOString() : value).slice(0, 10);
}

type Aggregate = {
  _sum: { amountUsd: unknown };
  _count: number;
};

export type FinancialSummaryDto = {
  ingresosCobrados: { cantidad: number; totalUsd: number };
  gastosPagados: { cantidad: number; totalUsd: number };
  netoCobradoUsd: number;
  ingresosPendientes: { cantidad: number; totalUsd: number };
  gastosPendientes: { cantidad: number; totalUsd: number };
  ingresosVencidos: { cantidad: number; totalUsd: number };
  gastosVencidos: { cantidad: number; totalUsd: number };
};

export function toFinancialSummaryDto(input: {
  paidIncomes: Aggregate;
  paidExpenses: Aggregate;
  pendingIncomes: Aggregate;
  pendingExpenses: Aggregate;
  overdueIncomes: Aggregate;
  overdueExpenses: Aggregate;
}): FinancialSummaryDto {
  const paidIncomesUsd = money(input.paidIncomes._sum.amountUsd);
  const paidExpensesUsd = money(input.paidExpenses._sum.amountUsd);
  return {
    ingresosCobrados: {
      cantidad: input.paidIncomes._count,
      totalUsd: paidIncomesUsd,
    },
    gastosPagados: {
      cantidad: input.paidExpenses._count,
      totalUsd: paidExpensesUsd,
    },
    netoCobradoUsd: paidIncomesUsd - paidExpensesUsd,
    ingresosPendientes: {
      cantidad: input.pendingIncomes._count,
      totalUsd: money(input.pendingIncomes._sum.amountUsd),
    },
    gastosPendientes: {
      cantidad: input.pendingExpenses._count,
      totalUsd: money(input.pendingExpenses._sum.amountUsd),
    },
    ingresosVencidos: {
      cantidad: input.overdueIncomes._count,
      totalUsd: money(input.overdueIncomes._sum.amountUsd),
    },
    gastosVencidos: {
      cantidad: input.overdueExpenses._count,
      totalUsd: money(input.overdueExpenses._sum.amountUsd),
    },
  };
}

export type ClientSummaryDto = {
  id: string;
  nombre: string;
  cantidadProyectos: number;
};

export function toClientSummaryDto(input: {
  id: string;
  name: string;
  _count: { projects: number };
}): ClientSummaryDto {
  return {
    id: input.id,
    nombre: input.name,
    cantidadProyectos: input._count.projects,
  };
}

export type ProjectSummaryDto = {
  id: string;
  nombre: string;
  cliente: { id: string; nombre: string };
  activo: boolean;
  inicio: string | null;
  fin: string | null;
  importeUnicoUsd: number | null;
  importeMensualUsd: number | null;
  cantidadIngresos: number;
  cantidadGastos: number;
};

export function toProjectSummaryDto(input: {
  id: string;
  name: string;
  isActive: boolean;
  startDate: Date | string | null;
  endDate: Date | string | null;
  oneTimeAmountUsd: unknown | null;
  monthlyRecurringAmountUsd: unknown | null;
  client: { id: string; name: string };
  _count: { incomes: number; expenses: number };
}): ProjectSummaryDto {
  return {
    id: input.id,
    nombre: input.name,
    cliente: { id: input.client.id, nombre: input.client.name },
    activo: input.isActive,
    inicio: date(input.startDate),
    fin: date(input.endDate),
    importeUnicoUsd:
      input.oneTimeAmountUsd === null ? null : money(input.oneTimeAmountUsd),
    importeMensualUsd:
      input.monthlyRecurringAmountUsd === null
        ? null
        : money(input.monthlyRecurringAmountUsd),
    cantidadIngresos: input._count.incomes,
    cantidadGastos: input._count.expenses,
  };
}

export type FlowIncomeDto = {
  id: string;
  concepto: string;
  tipoId: string;
  tipo: string;
  estado: "PAID" | "PENDING";
  vencimiento: string | null;
  fechaCobro: string | null;
  montoOriginal: number;
  monedaOriginal: "USD" | "ARS";
  tipoCambio: number | null;
  montoUsd: number;
  cliente: string | null;
  clienteId: string | null;
  proyecto: string | null;
  proyectoId: string | null;
  vencido: boolean;
};

export type FlowExpenseDto = {
  id: string;
  concepto: string;
  categoriaId: string;
  tipo: "FIXED" | "VARIABLE";
  estado: "PAID" | "PENDING";
  vencimiento: string | null;
  fechaPago: string | null;
  montoOriginal: number;
  monedaOriginal: "USD" | "ARS";
  tipoCambio: number | null;
  montoUsd: number;
  categoria: string;
  proyecto: string | null;
  proyectoId: string | null;
  vencido: boolean;
};

function originalMoney(
  amountUsd: unknown,
  amountArs: unknown | null,
  exchangeRate: unknown | null,
) {
  if (amountArs !== null) {
    return {
      montoOriginal: money(amountArs),
      monedaOriginal: "ARS" as const,
      tipoCambio: exchangeRate === null ? null : money(exchangeRate),
    };
  }
  return {
    montoOriginal: money(amountUsd),
    monedaOriginal: "USD" as const,
    tipoCambio: null,
  };
}

function isOverdue(
  status: "PAID" | "PENDING",
  dueDate: Date | string | null,
  today: Date,
) {
  const due = date(dueDate);
  return status === "PENDING" && due !== null && due < date(today)!;
}

export function toFlowIncomeDto(input: {
  id: string;
  concept: string;
  status: "PAID" | "PENDING";
  dueDate: Date | string | null;
  effectiveDate: Date | string | null;
  amountUsd: unknown;
  amountArs: unknown | null;
  exchangeRate: unknown | null;
  type: { id: string; name: string };
  client: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
}, today: Date): FlowIncomeDto {
  const original = originalMoney(
    input.amountUsd,
    input.amountArs,
    input.exchangeRate,
  );
  return {
    id: input.id,
    concepto: input.concept,
    tipoId: input.type.id,
    tipo: input.type.name,
    estado: input.status,
    vencimiento: date(input.dueDate),
    fechaCobro: date(input.effectiveDate),
    ...original,
    montoUsd: money(input.amountUsd),
    cliente: input.client?.name ?? null,
    clienteId: input.client?.id ?? null,
    proyecto: input.project?.name ?? null,
    proyectoId: input.project?.id ?? null,
    vencido: isOverdue(input.status, input.dueDate, today),
  };
}

export function toFlowExpenseDto(input: {
  id: string;
  concept: string;
  type: "FIXED" | "VARIABLE";
  status: "PAID" | "PENDING";
  dueDate: Date | string | null;
  effectiveDate: Date | string | null;
  amountUsd: unknown;
  amountArs: unknown | null;
  exchangeRate: unknown | null;
  category: { id: string; name: string };
  project: { id: string; name: string } | null;
}, today: Date): FlowExpenseDto {
  const original = originalMoney(
    input.amountUsd,
    input.amountArs,
    input.exchangeRate,
  );
  return {
    id: input.id,
    concepto: input.concept,
    categoriaId: input.category.id,
    tipo: input.type,
    estado: input.status,
    vencimiento: date(input.dueDate),
    fechaPago: date(input.effectiveDate),
    ...original,
    montoUsd: money(input.amountUsd),
    categoria: input.category.name,
    proyecto: input.project?.name ?? null,
    proyectoId: input.project?.id ?? null,
    vencido: isOverdue(input.status, input.dueDate, today),
  };
}

export type ProjectAgreementDto = {
  montoOriginal: number;
  monedaOriginal: "USD" | "ARS";
  tipoCambio: number | null;
  montoUsd: number;
};

export function toProjectAgreementDto(input: {
  originalAmount: unknown | null;
  currency: "USD" | "ARS" | null;
  exchangeRate: unknown | null;
  amountUsd: unknown | null;
}): ProjectAgreementDto | null {
  if (
    input.originalAmount === null ||
    input.currency === null ||
    input.amountUsd === null
  ) {
    return null;
  }
  return {
    montoOriginal: money(input.originalAmount),
    monedaOriginal: input.currency,
    tipoCambio:
      input.exchangeRate === null ? null : money(input.exchangeRate),
    montoUsd: money(input.amountUsd),
  };
}

export function toPlanningTaskDto(input: {
  id: string;
  name: string;
  description: string | null;
  type: "TASK" | "MILESTONE";
  startDate: Date | string;
  endDate: Date | string;
  status: "TODO" | "IN_PROGRESS" | "TO_REVIEW" | "BLOCKED" | "DONE";
  position: number;
  clientVisible?: boolean;
  phase: { id: string; name: string } | null;
}, today: Date) {
  const end = date(input.endDate)!;
  return {
    id: input.id,
    nombre: input.name,
    descripcion: input.description,
    tipo: input.type,
    estado: input.status,
    inicio: date(input.startDate)!,
    fin: end,
    orden: input.position,
    clientVisible: input.clientVisible ?? false,
    fase: input.phase
      ? { id: input.phase.id, nombre: input.phase.name }
      : null,
    atrasada:
      input.type === "TASK" && input.status !== "DONE" && end < date(today)!,
  };
}
