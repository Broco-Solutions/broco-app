import type { AuthInfo } from "@modelcontextprotocol/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EnabledMcpConfig } from "@/lib/mcp/config";
import { assertReadOnlyTestDatabase } from "@/lib/test-db-guard";
import { prisma } from "@/server/prisma";
import {
  createMcpHttpHandler,
  createMcpProtocolHandler,
} from "@/server/mcp/http";
import {
  getCashFlow,
  getClients,
  getExpenses,
  getFinancialSummary,
  getIncomes,
  getProjectDetail,
  getProjectPlanning,
  getProjects,
  getProjectSummaries,
} from "@/server/mcp/tools";

const hasTestDatabase = Boolean(
  process.env.DATABASE_URL && process.env.DATABASE_URL_TEST,
);

const testMcpConfig: EnabledMcpConfig = {
  status: "ok",
  resourceUrl: "https://broco.test/api/mcp",
  requiredScope: "mcp:read",
  auth: {
    issuer: "https://issuer.test/",
    audience: "https://broco.test/api/mcp",
    allowedSubjects: new Set(["test|allowed"]),
    allowedEmails: new Set(),
    emailClaim: "email",
    emailVerifiedClaim: "email_verified",
  },
};

const testAuth: AuthInfo = {
  token: "integration-test-token",
  clientId: "integration-test-client",
  scopes: ["mcp:read"],
  expiresAt: Math.floor(Date.now() / 1000) + 60,
};

async function readJsonRpcPayload(response: Response) {
  const body = await response.text();
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = body
      .split("\n")
      .find((line) => line.startsWith("data: "))
      ?.slice("data: ".length);
    if (!data) throw new Error("La respuesta SSE no contiene un evento MCP");
    return JSON.parse(data) as Record<string, unknown>;
  }
  return JSON.parse(body) as Record<string, unknown>;
}

describe.skipIf(!hasTestDatabase)("MCP solo lectura contra PostgreSQL de test", () => {
  let beforeCounts: number[] | undefined;

  beforeAll(async () => {
    assertReadOnlyTestDatabase();
    beforeCounts = await Promise.all([
      prisma.client.count(),
      prisma.project.count(),
      prisma.incomeType.count(),
      prisma.income.count(),
      prisma.expenseCategory.count(),
      prisma.expense.count(),
      prisma.projectPhase.count(),
      prisma.projectTask.count(),
      prisma.projectShareLink.count(),
    ]);
  });

  afterAll(async () => {
    if (!beforeCounts) {
      await prisma.$disconnect();
      return;
    }
    const afterCounts = await Promise.all([
      prisma.client.count(),
      prisma.project.count(),
      prisma.incomeType.count(),
      prisma.income.count(),
      prisma.expenseCategory.count(),
      prisma.expense.count(),
      prisma.projectPhase.count(),
      prisma.projectTask.count(),
      prisma.projectShareLink.count(),
    ]);
    expect(afterCounts).toEqual(beforeCounts);
    await prisma.$disconnect();
  });

  it("consulta clientes con límite acotado y DTO mínimo", async () => {
    const result = await getClients({ pagina: 1, limite: 2 });
    expect(result.clientes.length).toBeLessThanOrEqual(2);
    for (const client of result.clientes) {
      expect(Object.keys(client).sort()).toEqual([
        "cantidadProyectos",
        "id",
        "nombre",
      ]);
    }
  });

  it("calcula solo agregados financieros dentro del rango", async () => {
    const result = await getFinancialSummary({
      desde: "2026-01-01",
      hasta: "2026-12-31",
    });
    expect(Object.keys(result).sort()).toEqual([
      "gastosPagados",
      "gastosPendientes",
      "gastosVencidos",
      "ingresosCobrados",
      "ingresosPendientes",
      "ingresosVencidos",
      "netoCobradoUsd",
    ]);
  });

  it("consulta proyectos con el contrato compatible existente", async () => {
    const result = await getProjects({ pagina: 1, limite: 2 });
    expect(result.proyectos.length).toBeLessThanOrEqual(2);
    for (const project of result.proyectos) {
      expect(Object.keys(project).sort()).toEqual([
        "activo",
        "cantidadGastos",
        "cantidadIngresos",
        "cliente",
        "fin",
        "id",
        "importeMensualUsd",
        "importeUnicoUsd",
        "inicio",
        "nombre",
      ]);
    }
  });

  it("expone flujo de fondos paginado sin notas ni datos técnicos", async () => {
    const result = await getCashFlow({
      desde: "2026-01-01",
      hasta: "2026-12-31",
      pagina: 1,
      limite: 2,
    });
    expect(result.ingresos.items.length).toBeLessThanOrEqual(2);
    expect(result.gastos.items.length).toBeLessThanOrEqual(2);
    expect(JSON.stringify(result)).not.toMatch(
      /notes|password|token|secret|contactEmail|createdAt|updatedAt/i,
    );
  });

  it("consulta ingresos individuales con filtros y DTO controlado", async () => {
    const result = await getIncomes({ pagina: 1, limite: 2 });
    expect(result.ingresos.length).toBeLessThanOrEqual(2);
    for (const income of result.ingresos) {
      expect(Object.keys(income).sort()).toEqual([
        "cliente",
        "clienteId",
        "concepto",
        "estado",
        "fechaCobro",
        "id",
        "monedaOriginal",
        "montoOriginal",
        "montoUsd",
        "proyecto",
        "proyectoId",
        "tipo",
        "tipoCambio",
        "tipoId",
        "vencido",
        "vencimiento",
      ]);
    }
  });

  it("consulta gastos individuales con filtros y DTO controlado", async () => {
    const result = await getExpenses({ pagina: 1, limite: 2 });
    expect(result.gastos.length).toBeLessThanOrEqual(2);
    for (const expense of result.gastos) {
      expect(Object.keys(expense).sort()).toEqual([
        "categoria",
        "categoriaId",
        "concepto",
        "estado",
        "fechaPago",
        "id",
        "monedaOriginal",
        "montoOriginal",
        "montoUsd",
        "proyecto",
        "proyectoId",
        "tipo",
        "tipoCambio",
        "vencido",
        "vencimiento",
      ]);
    }
  });

  it("aplica filtros combinados de ingresos sobre su fecha de negocio", async () => {
    const sample = await prisma.income.findFirst({
      where: {
        OR: [
          { status: "PAID", effectiveDate: { not: null } },
          { status: "PENDING", dueDate: { not: null } },
        ],
      },
      select: {
        id: true,
        clientId: true,
        projectId: true,
        status: true,
        dueDate: true,
        effectiveDate: true,
        type: { select: { name: true } },
      },
    });
    expect(sample).not.toBeNull();
    const businessDate =
      sample!.status === "PAID" ? sample!.effectiveDate : sample!.dueDate;
    const day = businessDate!.toISOString().slice(0, 10);

    const result = await getIncomes({
      desde: day,
      hasta: day,
      ...(sample!.clientId ? { clientId: sample!.clientId } : {}),
      ...(sample!.projectId ? { projectId: sample!.projectId } : {}),
      estado: sample!.status,
      tipo: sample!.type.name,
      pagina: 1,
      limite: 50,
    });
    expect(result.ingresos.some((income) => income.id === sample!.id)).toBe(true);
    expect(result.ingresos.every((income) => income.estado === sample!.status)).toBe(
      true,
    );
    expect(result.ingresos.every((income) => income.tipo === sample!.type.name)).toBe(
      true,
    );
  });

  it("aplica filtros combinados de gastos sobre su fecha de negocio", async () => {
    const sample = await prisma.expense.findFirst({
      where: {
        OR: [
          { status: "PAID", effectiveDate: { not: null } },
          { status: "PENDING", dueDate: { not: null } },
        ],
      },
      select: {
        id: true,
        projectId: true,
        type: true,
        status: true,
        dueDate: true,
        effectiveDate: true,
        category: { select: { name: true } },
      },
    });
    expect(sample).not.toBeNull();
    const businessDate =
      sample!.status === "PAID" ? sample!.effectiveDate : sample!.dueDate;
    const day = businessDate!.toISOString().slice(0, 10);

    const result = await getExpenses({
      desde: day,
      hasta: day,
      ...(sample!.projectId ? { projectId: sample!.projectId } : {}),
      categoria: sample!.category.name,
      estado: sample!.status,
      tipo: sample!.type,
      pagina: 1,
      limite: 50,
    });
    expect(result.gastos.some((expense) => expense.id === sample!.id)).toBe(true);
    expect(result.gastos.every((expense) => expense.estado === sample!.status)).toBe(
      true,
    );
    expect(
      result.gastos.every((expense) => expense.categoria === sample!.category.name),
    ).toBe(true);
  });

  it("devuelve detalle financiero paginado de un proyecto real", async () => {
    const project = await prisma.project.findFirst({ select: { id: true } });
    expect(project).not.toBeNull();

    const result = await getProjectDetail({
      projectId: project!.id,
      paginaIngresos: 1,
      paginaGastos: 1,
      limiteMovimientos: 2,
    });
    expect(result.encontrado).toBe(true);
    expect(result.proyecto?.id).toBe(project!.id);
    expect(result.ingresos?.ingresos.length).toBeLessThanOrEqual(2);
    expect(result.gastos?.gastos.length).toBeLessThanOrEqual(2);
    expect(JSON.stringify(result)).not.toMatch(
      /notes|password|token|secret|contactEmail|sharedFolder|createdAt|updatedAt/i,
    );
  });

  it("devuelve la planificación existente sin inventar responsables ni horas", async () => {
    const project = await prisma.project.findFirst({ select: { id: true } });
    expect(project).not.toBeNull();

    const result = await getProjectPlanning({
      projectId: project!.id,
      pagina: 1,
      limite: 2,
    });
    expect(result.encontrado).toBe(true);
    expect(result.proyecto?.id).toBe(project!.id);
    expect(result.tareas.length).toBeLessThanOrEqual(2);
    expect(JSON.stringify(result)).not.toMatch(
      /responsable|assignee|hours|horas|priority|prioridad|dependency|dependencia|clientVisible/i,
    );
  });

  it("resume proyectos con finanzas y avance sin exceder el límite", async () => {
    const result = await getProjectSummaries({ pagina: 1, limite: 2 });
    expect(result.proyectos.length).toBeLessThanOrEqual(2);
    for (const project of result.proyectos) {
      expect(project).toHaveProperty("resumenFinanciero");
      expect(project).toHaveProperty("planificacion");
    }
    expect(JSON.stringify(result)).not.toMatch(
      /notes|password|token|secret|contactEmail|sharedFolder|createdAt|updatedAt/i,
    );
  });

  it("responde sin resultados para IDs válidos inexistentes", async () => {
    const missingId = "00000000-0000-4000-8000-000000000000";
    await expect(getProjectDetail({ projectId: missingId })).resolves.toMatchObject({
      encontrado: false,
    });
    await expect(
      getProjectPlanning({ projectId: missingId, pagina: 1, limite: 2 }),
    ).resolves.toMatchObject({ encontrado: false, tareas: [] });
  });

  it("ejecuta las nueve herramientas mediante el protocolo MCP real", async () => {
    const project = await prisma.project.findFirst({ select: { id: true } });
    expect(project).not.toBeNull();

    const run = createMcpHttpHandler({
      readConfig: () => testMcpConfig,
      protocolHandler: createMcpProtocolHandler(),
      tokenVerifier: () => async () => testAuth,
    });
    const calls = [
      ["resumen_financiero", { desde: "2026-01-01", hasta: "2026-12-31" }],
      ["consultar_clientes", { pagina: 1, limite: 1 }],
      ["consultar_proyectos", { pagina: 1, limite: 1 }],
      [
        "flujo_fondos",
        { desde: "2026-01-01", hasta: "2026-12-31", pagina: 1, limite: 1 },
      ],
      ["consultar_ingresos", { pagina: 1, limite: 1 }],
      ["consultar_gastos", { pagina: 1, limite: 1 }],
      ["detalle_proyecto", { projectId: project!.id, limiteMovimientos: 1 }],
      ["planificacion_proyecto", { projectId: project!.id, limite: 1 }],
      ["resumen_proyectos", { pagina: 1, limite: 1 }],
    ] as const;

    for (const [name, args] of calls) {
      const response = await run(
        new Request(testMcpConfig.resourceUrl, {
          method: "POST",
          headers: {
            Accept: "application/json, text/event-stream",
            Authorization: "Bearer integration-test-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: name,
            method: "tools/call",
            params: { name, arguments: args },
          }),
        }),
      );
      expect(response.status, name).toBe(200);
      const payload = await readJsonRpcPayload(response);
      expect(payload, name).not.toHaveProperty("error");
      expect(payload, name).toHaveProperty("result.structuredContent");
      expect(JSON.stringify(payload), name).not.toMatch(
        /passwordHash|passwordEncrypted|contactEmail|contactPhone|sharedFolder|accessVersion|createdAt|updatedAt/i,
      );
    }
  });
});
