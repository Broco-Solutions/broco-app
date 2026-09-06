import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  cashFlowInputSchema,
  getCashFlow,
  getClients,
  getExpenses,
  getIncomes,
  getProjectDetail,
  getProjectPlanning,
  getProjects,
  getProjectSummaries,
  incomesInputSchema,
  MCP_TOOL_NAMES,
  registerTools,
  type McpReadServices,
} from "@/server/mcp/tools";

function services(): McpReadServices {
  return {
    financialSummary: vi.fn(),
    clients: vi.fn().mockResolvedValue([]),
    projects: vi.fn().mockResolvedValue([]),
    incomes: vi.fn().mockResolvedValue([]),
    expenses: vi.fn().mockResolvedValue([]),
    incomeList: vi.fn().mockResolvedValue([]),
    expenseList: vi.fn().mockResolvedValue([]),
    projectDetail: vi.fn().mockResolvedValue(null),
    projectPlanning: vi.fn().mockResolvedValue(null),
    projectSummaries: vi.fn().mockResolvedValue([]),
  } as unknown as McpReadServices;
}

describe("límites y DTOs MCP", () => {
  it.each(["2026-02-30", "2026-13-01", "2026-2-01"])(
    "rechaza fecha no real: %s",
    (desde) => {
      expect(() =>
        cashFlowInputSchema.parse({ desde, hasta: "2026-03-01" }),
      ).toThrow();
    },
  );

  it("rechaza rango invertido, demasiado largo, claves extra y límite excesivo", () => {
    expect(() =>
      cashFlowInputSchema.parse({ desde: "2026-03-02", hasta: "2026-03-01" }),
    ).toThrow();
    expect(() =>
      cashFlowInputSchema.parse({ desde: "2025-01-01", hasta: "2026-02-01" }),
    ).toThrow();
    expect(() =>
      cashFlowInputSchema.parse({
        desde: "2026-01-01",
        hasta: "2026-01-02",
        limite: 51,
      }),
    ).toThrow();
    expect(() =>
      cashFlowInputSchema.parse({
        desde: "2026-01-01",
        hasta: "2026-01-02",
        sql: "select *",
      }),
    ).toThrow();
  });

  it("exige ambos extremos en rangos opcionales", () => {
    expect(() => incomesInputSchema.parse({ desde: "2026-01-01" })).toThrow();
    expect(() =>
      incomesInputSchema.parse({
        desde: "2025-01-01",
        hasta: "2026-01-02",
      }),
    ).toThrow();
  });

  it("pagina en DB con limit+1 y devuelve solo el DTO permitido de cliente", async () => {
    const mock = services();
    vi.mocked(mock.clients).mockResolvedValueOnce([
      { id: "c1", name: "Cliente", _count: { projects: 2 } },
      { id: "c2", name: "Extra", _count: { projects: 0 } },
    ]);
    const result = await getClients({ pagina: 2, limite: 1 }, mock);
    expect(mock.clients).toHaveBeenCalledWith({
      search: undefined,
      skip: 1,
      take: 2,
    });
    expect(result).toEqual({
      pagina: 2,
      limite: 1,
      hayMas: true,
      clientes: [{ id: "c1", nombre: "Cliente", cantidadProyectos: 2 }],
    });
    expect(JSON.stringify(result)).not.toMatch(/email|phone|notes|password|token/i);
  });

  it("proyecto y flujo eliminan campos no incluidos en sus DTOs", async () => {
    const mock = services();
    vi.mocked(mock.projects).mockResolvedValueOnce([
      {
        id: "p1",
        name: "Proyecto",
        isActive: true,
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: null,
        oneTimeAmountUsd: new Prisma.Decimal(100),
        monthlyRecurringAmountUsd: null,
        client: { id: "c1", name: "Cliente" },
        _count: { incomes: 1, expenses: 2 },
      },
    ]);
    const projects = await getProjects({}, mock);
    expect(projects.proyectos[0]).toEqual({
      id: "p1",
      nombre: "Proyecto",
      cliente: { id: "c1", nombre: "Cliente" },
      activo: true,
      inicio: "2026-01-01",
      fin: null,
      importeUnicoUsd: 100,
      importeMensualUsd: null,
      cantidadIngresos: 1,
      cantidadGastos: 2,
    });

    vi.mocked(mock.incomes).mockResolvedValueOnce([
      {
        id: "i1",
        concept: "Cobro",
        status: "PENDING",
        dueDate: new Date("2026-01-02T00:00:00Z"),
        effectiveDate: null,
        amountUsd: new Prisma.Decimal(20),
        amountArs: null,
        exchangeRate: null,
        type: { id: "type-1", name: "Desarrollo" },
        client: { id: "c1", name: "Cliente" },
        project: null,
      },
    ]);
    const flow = await getCashFlow(
      { desde: "2026-01-01", hasta: "2026-01-31" },
      mock,
    );
    expect(flow.ingresos.items[0]).toEqual({
      id: "i1",
      concepto: "Cobro",
      tipoId: "type-1",
      tipo: "Desarrollo",
      estado: "PENDING",
      vencimiento: "2026-01-02",
      fechaCobro: null,
      montoOriginal: 20,
      monedaOriginal: "USD",
      tipoCambio: null,
      montoUsd: 20,
      cliente: "Cliente",
      clienteId: "c1",
      proyecto: null,
      proyectoId: null,
      vencido: expect.any(Boolean),
    });
  });

  it("consulta ingresos individuales con filtros y moneda original", async () => {
    const mock = services();
    vi.mocked(mock.incomeList).mockResolvedValueOnce([
      {
        id: "i-ars",
        concept: "Mantenimiento mensual",
        status: "PAID",
        dueDate: null,
        effectiveDate: new Date("2026-02-10T00:00:00Z"),
        amountUsd: new Prisma.Decimal("100"),
        amountArs: new Prisma.Decimal("120000"),
        exchangeRate: new Prisma.Decimal("1200"),
        type: { id: "t1", name: "Mantenimiento" },
        client: { id: "c1", name: "Cliente" },
        project: { id: "p1", name: "Proyecto" },
      },
    ]);

    const response = await getIncomes(
      {
        desde: "2026-02-01",
        hasta: "2026-02-28",
        projectId: "11111111-1111-4111-8111-111111111111",
        clientId: "22222222-2222-4222-8222-222222222222",
        estado: "PAID",
        tipo: "Mantenimiento",
        pagina: 2,
        limite: 1,
      },
      mock,
    );

    expect(mock.incomeList).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "11111111-1111-4111-8111-111111111111",
        clientId: "22222222-2222-4222-8222-222222222222",
        status: "PAID",
        typeName: "Mantenimiento",
        skip: 1,
        take: 2,
      }),
    );
    expect(response.ingresos[0]).toMatchObject({
      tipo: "Mantenimiento",
      estado: "PAID",
      fechaCobro: "2026-02-10",
      montoOriginal: 120000,
      monedaOriginal: "ARS",
      tipoCambio: 1200,
      montoUsd: 100,
      clienteId: "c1",
      proyectoId: "p1",
      vencido: false,
    });
    expect(JSON.stringify(response)).not.toMatch(/notes|password|token/i);
  });

  it("consulta gastos individuales y responde vacío sin resultados", async () => {
    const mock = services();
    vi.mocked(mock.expenseList).mockResolvedValueOnce([
      {
        id: "e1",
        concept: "Hosting",
        type: "FIXED",
        status: "PENDING",
        dueDate: new Date("2020-01-01T00:00:00Z"),
        effectiveDate: null,
        amountUsd: new Prisma.Decimal("25"),
        amountArs: null,
        exchangeRate: null,
        category: { id: "cat1", name: "Infraestructura" },
        project: null,
      },
    ]);
    const response = await getExpenses(
      { categoria: "Infraestructura", estado: "OVERDUE", limite: 1 },
      mock,
    );
    expect(response.gastos[0]).toMatchObject({
      categoriaId: "cat1",
      categoria: "Infraestructura",
      tipo: "FIXED",
      estado: "PENDING",
      monedaOriginal: "USD",
      montoOriginal: 25,
      vencido: true,
    });

    vi.mocked(mock.expenseList).mockResolvedValueOnce([]);
    await expect(getExpenses({}, mock)).resolves.toEqual({
      pagina: 1,
      limite: 20,
      hayMas: false,
      gastos: [],
    });
  });

  it("devuelve colecciones paginadas vacías sin error", async () => {
    const mock = services();
    const [clients, projects, flow, incomes, expenses, summaries] =
      await Promise.all([
        getClients({}, mock),
        getProjects({}, mock),
        getCashFlow(
          { desde: "2026-01-01", hasta: "2026-01-31" },
          mock,
        ),
        getIncomes({}, mock),
        getExpenses({}, mock),
        getProjectSummaries({}, mock),
      ]);

    expect(clients).toMatchObject({ hayMas: false, clientes: [] });
    expect(projects).toMatchObject({ hayMas: false, proyectos: [] });
    expect(flow.ingresos).toEqual({ hayMas: false, items: [] });
    expect(flow.gastos).toEqual({ hayMas: false, items: [] });
    expect(incomes).toMatchObject({ hayMas: false, ingresos: [] });
    expect(expenses).toMatchObject({ hayMas: false, gastos: [] });
    expect(summaries).toMatchObject({ hayMas: false, proyectos: [] });
  });

  it("devuelve detalle financiero inequívoco y movimientos paginados", async () => {
    const mock = services();
    const aggregate = (total: number, count: number) => ({
      _sum: { amountUsd: new Prisma.Decimal(total) },
      _count: count,
    });
    vi.mocked(mock.projectDetail).mockResolvedValueOnce({
      project: {
        id: "p1",
        name: "Proyecto",
        isActive: true,
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: null,
        goLiveDate: new Date("2026-06-01T00:00:00Z"),
        oneTimeOriginalAmount: new Prisma.Decimal(120000),
        oneTimeCurrency: "ARS",
        oneTimeExchangeRate: new Prisma.Decimal(1200),
        oneTimeAmountUsd: new Prisma.Decimal(100),
        monthlyRecurringOriginalAmount: new Prisma.Decimal(50),
        monthlyRecurringCurrency: "USD",
        monthlyRecurringExchangeRate: null,
        monthlyRecurringAmountUsd: new Prisma.Decimal(50),
        client: { id: "c1", name: "Cliente" },
      },
      incomeAll: aggregate(300, 3),
      incomePaid: aggregate(200, 2),
      incomePending: aggregate(100, 1),
      incomeOverdue: aggregate(40, 1),
      expenseAll: aggregate(120, 2),
      expensePaid: aggregate(70, 1),
      expensePending: aggregate(50, 1),
      expenseOverdue: aggregate(10, 1),
      incomeByType: [
        {
          typeId: "t1",
          _sum: { amountUsd: new Prisma.Decimal(300) },
          _count: 3,
        },
      ],
      incomeTypes: [{ id: "t1", name: "Desarrollo" }],
    });

    const response = await getProjectDetail(
      { projectId: "11111111-1111-4111-8111-111111111111" },
      mock,
    );
    expect(response.proyecto).toMatchObject({
      nombre: "Proyecto",
      goLive: "2026-06-01",
      importeUnico: {
        montoOriginal: 120000,
        monedaOriginal: "ARS",
        tipoCambio: 1200,
        montoUsd: 100,
      },
    });
    expect(response.resumenFinanciero).toMatchObject({
      resultadoTotalUsd: 180,
      resultadoCobradoUsd: 130,
      ingresos: { vencidos: { cantidad: 1, totalUsd: 40 } },
      gastos: { vencidos: { cantidad: 1, totalUsd: 10 } },
    });
    expect(response.ingresosPorTipo).toEqual([
      { tipoId: "t1", tipo: "Desarrollo", cantidad: 3, totalUsd: 300 },
    ]);
    expect(response.ingresos?.ingresos).toEqual([]);
    expect(response.gastos?.gastos).toEqual([]);
  });

  it("detalle y planificación informan proyecto inexistente sin error", async () => {
    const mock = services();
    await expect(
      getProjectDetail(
        { projectId: "11111111-1111-4111-8111-111111111111" },
        mock,
      ),
    ).resolves.toMatchObject({ encontrado: false, proyecto: null });
    await expect(
      getProjectPlanning(
        { projectId: "11111111-1111-4111-8111-111111111111" },
        mock,
      ),
    ).resolves.toMatchObject({
      encontrado: false,
      proyecto: null,
      tareas: [],
    });
  });

  it("expone planificación existente y calcula avance y atrasos", async () => {
    const mock = services();
    vi.mocked(mock.projectPlanning).mockResolvedValueOnce({
      project: {
        id: "p1",
        name: "Proyecto",
        isActive: true,
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
        goLiveDate: null,
        client: { id: "c1", name: "Cliente" },
        phases: [{ id: "f1", name: "Fase", position: 0 }],
        tasks: [
          {
            id: "task1",
            name: "Implementar",
            description: "Descripción útil",
            type: "TASK",
            startDate: new Date("2020-01-01T00:00:00Z"),
            endDate: new Date("2020-01-02T00:00:00Z"),
            status: "IN_PROGRESS",
            position: 0,
            phase: { id: "f1", name: "Fase" },
          },
        ],
      },
      taskGroups: [
        { type: "TASK", status: "DONE", _count: 1 },
        { type: "TASK", status: "IN_PROGRESS", _count: 1 },
        { type: "MILESTONE", status: "TODO", _count: 1 },
      ],
      overdueTasks: 1,
    });
    const response = await getProjectPlanning(
      { projectId: "11111111-1111-4111-8111-111111111111" },
      mock,
    );
    expect(response.resumen).toEqual({
      cantidadTareas: 2,
      tareasCompletadas: 1,
      tareasPendientes: 1,
      tareasAtrasadas: 1,
      cantidadHitos: 1,
      avancePorcentaje: 50,
    });
    expect(response.tareas[0]).toMatchObject({
      descripcion: "Descripción útil",
      fase: { id: "f1", nombre: "Fase" },
      atrasada: true,
    });
  });

  it("resume el portafolio sin horas ni datos privados inventados", async () => {
    const mock = services();
    vi.mocked(mock.projectSummaries).mockResolvedValueOnce([
      {
        project: {
          id: "p1",
          name: "Proyecto",
          isActive: true,
          startDate: null,
          endDate: null,
          goLiveDate: null,
          oneTimeOriginalAmount: null,
          oneTimeCurrency: null,
          oneTimeExchangeRate: null,
          oneTimeAmountUsd: null,
          monthlyRecurringOriginalAmount: new Prisma.Decimal(100),
          monthlyRecurringCurrency: "USD",
          monthlyRecurringExchangeRate: null,
          monthlyRecurringAmountUsd: new Prisma.Decimal(100),
          client: { id: "c1", name: "Cliente" },
        },
        incomeGroups: [
          {
            projectId: "p1",
            status: "PAID",
            _sum: { amountUsd: new Prisma.Decimal(250) },
            _count: 2,
          },
        ],
        expenseGroups: [
          {
            projectId: "p1",
            status: "PAID",
            _sum: { amountUsd: new Prisma.Decimal(100) },
            _count: 1,
          },
        ],
        overdueIncome: null,
        overdueExpense: null,
        taskGroups: [{ projectId: "p1", type: "TASK", status: "DONE", _count: 2 }],
        overdueTasks: 0,
      },
    ]);
    const response = await getProjectSummaries({}, mock);
    expect(response.proyectos[0]).toMatchObject({
      importeMensual: { monedaOriginal: "USD", montoUsd: 100 },
      resumenFinanciero: {
        resultadoTotalUsd: 150,
        resultadoCobradoUsd: 150,
      },
      planificacion: { avancePorcentaje: 100, cantidadTareas: 2 },
    });
    expect(JSON.stringify(response)).not.toMatch(
      /password|token|contact|notes|hours|responsable/i,
    );
  });
});

describe("superficie MCP solo lectura", () => {
  it("registra exactamente las tools marcadas como no destructivas", () => {
    const registered: Array<{ name: string; definition: Record<string, unknown> }> = [];
    const server = {
      registerTool(name: string, definition: Record<string, unknown>) {
        registered.push({ name, definition });
      },
    } as unknown as McpServer;
    registerTools(server, services());
    expect(registered.map(({ name }) => name)).toEqual(MCP_TOOL_NAMES);
    for (const { definition } of registered) {
      expect(definition.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
      expect(definition._meta).toEqual({
        securitySchemes: [{ type: "oauth2", scopes: ["mcp:read"] }],
      });
    }
  });

  it("los módulos MCP no contienen primitivas de mutación, SQL ni ejecución arbitraria", () => {
    const files = [
      "src/server/mcp/tools.ts",
      "src/server/mcp/dtos.ts",
      "src/server/mcp/http.ts",
    ];
    const source = files
      .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
      .join("\n");
    expect(source).not.toMatch(
      /\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/,
    );
    expect(source).not.toMatch(/\$(?:queryRaw|executeRaw)|child_process|eval\s*\(/);
  });
});
