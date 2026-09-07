import type { AuthInfo } from "@modelcontextprotocol/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/prisma";
import { createMcpHttpHandler, createMcpProtocolHandler } from "@/server/mcp/http";
import type { EnabledMcpConfig } from "@/lib/mcp/config";

const enabled: EnabledMcpConfig = {
  status: "ok", writeEnabled: true, resourceUrl: "https://broco.test/api/mcp", requiredScope: "mcp:read",
  auth: { issuer: "https://issuer.test/", audience: "https://broco.test/api/mcp", allowedSubjects: new Set(["test|writer"]), allowedEmails: new Set(), emailClaim: "email", emailVerifiedClaim: "email_verified" },
};
const auth: AuthInfo = { token: "test", clientId: "test", scopes: ["mcp:read", "mcp:write"], expiresAt: Math.floor(Date.now() / 1000) + 60, extra: { sub: "test|writer" } };
const hasDb = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL_TEST);
const run = createMcpHttpHandler({ readConfig: () => enabled, protocolHandler: createMcpProtocolHandler(true), tokenVerifier: () => async () => auth });
let clientId = "";
let projectId = "";
let projectTwoId = "";
let incomeTypeId = "";
let categoryId = "";

async function payload(response: Response) {
  const text = await response.text();
  const data = response.headers.get("content-type")?.includes("text/event-stream")
    ? text.split("\n").find((line) => line.startsWith("data: "))!.slice(6)
    : text;
  return JSON.parse(data) as any;
}
async function call(name: string, args: Record<string, unknown>, scopes = auth.scopes) {
  const response = await createMcpHttpHandler({ readConfig: () => enabled, protocolHandler: createMcpProtocolHandler(true), tokenVerifier: () => async () => ({ ...auth, scopes }) })(new Request(enabled.resourceUrl, {
    method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: name, method: "tools/call", params: { name, arguments: args } }),
  }));
  return payload(response);
}

describe.skipIf(!hasDb)("MCP escritura contra PostgreSQL de test", () => {
  beforeAll(async () => {
    const suffix = `${Date.now()}`;
    const client = await prisma.client.create({ data: { name: `mcp-write-client-${suffix}` } }); clientId = client.id;
    const project = await prisma.project.create({ data: { clientId, name: `mcp-write-project-${suffix}` } }); projectId = project.id;
    const projectTwo = await prisma.project.create({ data: { clientId, name: `mcp-write-project-two-${suffix}` } }); projectTwoId = projectTwo.id;
  });
  afterAll(async () => {
    if (projectId) {
      await prisma.projectTask.deleteMany({ where: { projectId: { in: [projectId, projectTwoId] } } });
      await prisma.projectPhase.deleteMany({ where: { projectId: { in: [projectId, projectTwoId] } } });
      await prisma.income.deleteMany({ where: { clientId } });
      await prisma.expense.deleteMany({ where: { projectId: { in: [projectId, projectTwoId] } } });
      if (incomeTypeId) await prisma.incomeType.deleteMany({ where: { id: incomeTypeId } });
      if (categoryId) await prisma.expenseCategory.deleteMany({ where: { id: categoryId } });
      await prisma.project.deleteMany({ where: { id: { in: [projectId, projectTwoId] } } });
      await prisma.client.deleteMany({ where: { id: clientId } });
    }
    await prisma.$disconnect();
  });

  it("registra escritura sólo con flag y exige mcp:write", async () => {
    const denied = await call("crear_categoria_gasto", { nombre: "denied" }, ["mcp:read"]);
    expect(denied.result.isError).toBe(true);
    expect(JSON.stringify(denied)).toContain("INSUFFICIENT_SCOPE");
    const readDenied = await call("crear_categoria_gasto", { nombre: "denied" }, ["mcp:write"]);
    expect(JSON.stringify(readDenied)).toContain("insufficient_scope");
    const tools = await run(new Request(enabled.resourceUrl, { method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) }));
    expect(JSON.stringify(await payload(tools))).toContain("crear_ingreso");
  });

  it("completa ciclo de ingreso, gasto y catálogos", async () => {
    let out = await call("crear_tipo_ingreso", { nombre: `Intereses MCP ${Date.now()}`, requiereProyecto: false });
    incomeTypeId = out.result.structuredContent.tipo.id;
    expect((await call("consultar_tipos_ingreso", { pagina: 1, limite: 50 })).result.structuredContent.tipos.some((type: { id: string }) => type.id === incomeTypeId)).toBe(true);
    out = await call("actualizar_tipo_ingreso", { typeId: incomeTypeId, nombre: `Intereses MCP actualizado ${Date.now()}` });
    expect(out.result.structuredContent.tipo.id).toBe(incomeTypeId);
    out = await call("crear_categoria_gasto", { nombre: `Categoría MCP ${Date.now()}` });
    categoryId = out.result.structuredContent.categoria.id;
    expect((await call("consultar_categorias_gasto", { pagina: 1, limite: 50 })).result.structuredContent.categorias.some((category: { id: string }) => category.id === categoryId)).toBe(true);
    out = await call("actualizar_categoria_gasto", { categoryId, nombre: `Categoría MCP actualizada ${Date.now()}` });
    expect(out.result.structuredContent.categoria.id).toBe(categoryId);
    const income = await call("crear_ingreso", { concepto: "Ingreso MCP", typeId: incomeTypeId, clientId, dinero: { moneda: "USD", monto: 100 }, situacion: { estado: "PENDING", vencimiento: "2026-12-31" } });
    const incomeId = income.result.structuredContent.ingreso.id;
    expect((await call("consultar_ingresos", { incomeId, pagina: 1, limite: 1 })).result.structuredContent.ingresos[0].id).toBe(incomeId);
    await call("actualizar_ingreso", { incomeId, dinero: { moneda: "ARS", monto: 150000, tipoCambio: 1500 } });
    await call("marcar_ingreso_cobrado", { incomeId, fechaCobro: "2026-06-01" });
    expect((await call("eliminar_tipo_ingreso", { typeId: incomeTypeId, confirmarEliminacion: true })).result.isError).toBe(true);
    expect((await call("eliminar_ingreso", { incomeId })).result.isError).toBe(true);
    await call("eliminar_ingreso", { incomeId, confirmarEliminacion: true });
    const expense = await call("crear_gasto", { concepto: "Gasto MCP", categoryId, projectId, tipo: "FIXED", dinero: { moneda: "USD", monto: 50 }, situacion: { estado: "PENDING", vencimiento: "2026-12-31" } });
    const expenseId = expense.result.structuredContent.gasto.id;
    await call("actualizar_gasto", { expenseId, tipo: "VARIABLE" });
    await call("marcar_gasto_pagado", { expenseId, fechaPago: "2026-06-01" });
    expect((await call("eliminar_categoria_gasto", { categoryId, confirmarEliminacion: true })).result.isError).toBe(true);
    expect((await call("eliminar_gasto", { expenseId })).result.isError).toBe(true);
    await call("eliminar_gasto", { expenseId, confirmarEliminacion: true });
    await call("eliminar_tipo_ingreso", { typeId: incomeTypeId, confirmarEliminacion: true });
    await call("eliminar_categoria_gasto", { categoryId, confirmarEliminacion: true });
    incomeTypeId = "";
    categoryId = "";
  });

  it("gestiona fases, TASK, MILESTONE, visibilidad, movimiento y eliminación", async () => {
    const phaseA = (await call("crear_fase_proyecto", { projectId, nombre: "Fase A" })).result.structuredContent.fase;
    const phaseB = (await call("crear_fase_proyecto", { projectId, nombre: "Fase B" })).result.structuredContent.fase;
    await call("reordenar_fases_proyecto", { projectId, phaseIdsOrdenados: [phaseB.id, phaseA.id] });
    expect((await call("reordenar_fases_proyecto", { projectId, phaseIdsOrdenados: [phaseA.id] })).result.isError).toBe(true);
    const task = (await call("crear_tarea_proyecto", { projectId, phaseId: phaseA.id, nombre: "Tarea", tipo: "TASK", inicio: "2026-01-01", fin: "2026-01-03" })).result.structuredContent.tarea;
    expect(task.clientVisible).toBe(false);
    const milestone = (await call("crear_tarea_proyecto", { projectId, phaseId: phaseA.id, nombre: "Hito", tipo: "MILESTONE", inicio: "2026-01-04", clientVisible: true })).result.structuredContent.tarea;
    await call("actualizar_tarea_proyecto", { projectId, taskId: task.id, clientVisible: true, descripcion: "Visible" });
    await call("cambiar_estado_tarea", { projectId, taskId: task.id, estado: "IN_PROGRESS" });
    await call("mover_tarea_de_fase", { projectId, taskId: task.id, phaseId: phaseB.id });
    expect((await call("mover_tarea_de_fase", { projectId: projectTwoId, taskId: task.id, phaseId: null })).result.isError).toBe(true);
    await call("reordenar_tareas_proyecto", { projectId, phaseId: phaseA.id, taskIdsOrdenados: [milestone.id] });
    await call("actualizar_tarea_proyecto", { projectId, taskId: task.id, tipo: "MILESTONE", inicio: "2026-02-01" });
    await call("actualizar_tarea_proyecto", { projectId, taskId: task.id, tipo: "TASK", inicio: "2026-02-01", fin: "2026-02-02" });
    expect((await call("eliminar_tarea_proyecto", { projectId, taskId: milestone.id })).result.isError).toBe(true);
    await call("eliminar_tarea_proyecto", { projectId, taskId: milestone.id, confirmarEliminacion: true });
    await call("eliminar_fase_proyecto", { projectId, phaseId: phaseB.id, confirmarEliminacion: true });
    expect((await prisma.projectTask.findUnique({ where: { id: task.id } }))?.phaseId).toBeNull();
    await call("eliminar_tarea_proyecto", { projectId, taskId: task.id, confirmarEliminacion: true });
    await call("eliminar_fase_proyecto", { projectId, phaseId: phaseA.id, confirmarEliminacion: true });
  });
});
