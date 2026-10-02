import type { McpServer, ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod";
import { MCP_WRITE_SCOPE } from "@/lib/mcp/config";
import { todayKeyArgentina, toUtcDate } from "@/lib/dates";
import { toFlowExpenseDto, toFlowIncomeDto, toPlanningTaskDto } from "@/server/mcp/dtos";
import { createIncome, deleteIncome, getIncome, markIncomePaidForMcp, patchIncomeForMcp } from "@/server/services/incomes";
import { createExpense, deleteExpense, getExpense, markExpensePaidForMcp, patchExpenseForMcp } from "@/server/services/expenses";
import { createIncomeType, deleteIncomeType, listIncomeTypes, updateIncomeType } from "@/server/services/income-types";
import { createCategory, deleteCategory, listCategories, updateCategory } from "@/server/services/expense-categories";
import { createPhase, deletePhase, getPhase, reorderProjectPhases, updatePhase } from "@/server/services/project-phases";
import { TASK_STATUSES, createTask, deleteTask, getTask, setTaskPhase, setTaskStatus, reorderProjectTasks, setTaskClientVisible, updateTask } from "@/server/services/project-tasks";
import {
  McpAuthorizationError,
  mcpErrorResult,
  requireMcpAdmin,
  requireMcpWriteActor,
} from "@/server/mcp/identity";
import { OPERATIONAL_MCP_WRITE_TOOL_NAMES } from "@/server/mcp/operational-tools";

export const WRITE_MCP_TOOL_NAMES = [
  "crear_ingreso", "actualizar_ingreso", "marcar_ingreso_cobrado", "eliminar_ingreso",
  "crear_gasto", "actualizar_gasto", "marcar_gasto_pagado", "eliminar_gasto",
  "crear_tipo_ingreso", "actualizar_tipo_ingreso", "eliminar_tipo_ingreso",
  "crear_categoria_gasto", "actualizar_categoria_gasto", "eliminar_categoria_gasto",
  "crear_fase_proyecto", "actualizar_fase_proyecto", "reordenar_fases_proyecto", "eliminar_fase_proyecto",
  "crear_tarea_proyecto", "actualizar_tarea_proyecto", "cambiar_estado_tarea", "mover_tarea_de_fase", "reordenar_tareas_proyecto", "eliminar_tarea_proyecto",
  ...OPERATIONAL_MCP_WRITE_TOOL_NAMES,
] as const;

const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(500);
const description = z.string().trim().max(4_000).nullable().optional();
const number = z.number().finite().positive().max(999_999_999_999);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && year <= 2100 && parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}, "Fecha calendario inválida");
const money = z.discriminatedUnion("moneda", [
  z.object({ moneda: z.literal("USD"), monto: number }).strict(),
  z.object({ moneda: z.literal("ARS"), monto: number, tipoCambio: number }).strict(),
]);
const pending = z.object({ estado: z.literal("PENDING"), vencimiento: date }).strict();
const paidIncome = z.object({ estado: z.literal("PAID"), fechaCobro: date, vencimiento: z.null().optional() }).strict();
const paidExpense = z.object({ estado: z.literal("PAID"), fechaPago: date, vencimiento: z.null().optional() }).strict();

const writeMetadata = (destructive = false, idempotent = false) => ({
  annotations: { readOnlyHint: false, destructiveHint: destructive, idempotentHint: idempotent, openWorldHint: false },
  _meta: { securitySchemes: [{ type: "oauth2", scopes: ["mcp:read", MCP_WRITE_SCOPE] }] },
});
const readMetadata = {
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  _meta: { securitySchemes: [{ type: "oauth2", scopes: ["mcp:read"] }] },
};

function today() { return toUtcDate(todayKeyArgentina()); }
function result(data: Record<string, unknown>) { return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data }; }
function errorResult(error: unknown) {
  if (error instanceof McpAuthorizationError) return mcpErrorResult(error);
  const message = error instanceof Error ? error.message : "Error de operación";
  const code = message === "INSUFFICIENT_SCOPE" ? "INSUFFICIENT_SCOPE"
    : message === "CONFIRMATION_REQUIRED" ? "CONFIRMATION_REQUIRED"
    : /no encontrado/i.test(message) ? "NOT_FOUND"
    : /no pertenece|proyecto asociado|incompleta|repetidos/i.test(message) ? "RELATION_MISMATCH"
    : /inactivo/i.test(message) ? "INACTIVE_REFERENCE"
    : /no se puede eliminar/i.test(message) ? "IN_USE"
    : /existe|unique/i.test(message) ? "CONFLICT" : "VALIDATION_ERROR";
  const safeMessage = ["INSUFFICIENT_SCOPE", "CONFIRMATION_REQUIRED"].includes(message) || /no encontrado|no pertenece|proyecto asociado|incompleta|repetidos|inactivo|no se puede eliminar|existe/i.test(message)
    ? message
    : "Operación inválida.";
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: { code, message: safeMessage } }) }], isError: true };
}
function requireDeletionConfirmation(value: boolean | undefined) {
  if (value !== true) throw new Error("CONFIRMATION_REQUIRED");
}
function audit(ctx: ServerContext, operation: string, entityType: string, entityId: string, changedFields: string[]) {
  console.info(JSON.stringify({ event: "mcp_mutation", actorSub: ctx.http?.authInfo?.extra?.sub, operation, entityType, entityId, changedFields, timestamp: new Date().toISOString(), requestId: String(ctx.mcpReq.id ?? "") }));
}
async function assertTaskProject(taskId: string, projectId: string) {
  const task = await getTask(taskId);
  if (task.projectId !== projectId) throw new Error("La tarea no pertenece a este proyecto.");
  return task;
}
async function assertPhaseProject(phaseId: string, projectId: string) {
  const phase = await getPhase(phaseId);
  if (phase.projectId !== projectId) throw new Error("La fase no pertenece a este proyecto.");
  return phase;
}
function incomeInput(input: { concepto: string; typeId: string; projectId?: string | null; clientId?: string | null; dinero: z.infer<typeof money>; situacion: z.infer<typeof pending> | z.infer<typeof paidIncome> }) {
  return {
    concept: input.concepto, typeId: input.typeId, projectId: input.projectId ?? null, clientId: input.clientId ?? null,
    status: input.situacion.estado,
    amountUsd: input.dinero.moneda === "USD" ? input.dinero.monto : null,
    amountArs: input.dinero.moneda === "ARS" ? input.dinero.monto : null,
    exchangeRate: input.dinero.moneda === "ARS" ? input.dinero.tipoCambio : null,
    dueDate: input.situacion.vencimiento ?? null,
    effectiveDate: input.situacion.estado === "PAID" ? input.situacion.fechaCobro : null,
  };
}
function expenseInput(input: { concepto: string; categoryId: string; projectId?: string | null; tipo: "FIXED" | "VARIABLE"; dinero: z.infer<typeof money>; situacion: z.infer<typeof pending> | z.infer<typeof paidExpense> }) {
  return {
    concept: input.concepto, expenseCategoryId: input.categoryId, projectId: input.projectId ?? null, type: input.tipo,
    status: input.situacion.estado,
    amountUsd: input.dinero.moneda === "USD" ? input.dinero.monto : null,
    amountArs: input.dinero.moneda === "ARS" ? input.dinero.monto : null,
    exchangeRate: input.dinero.moneda === "ARS" ? input.dinero.tipoCambio : null,
    dueDate: input.situacion.vencimiento ?? null,
    effectiveDate: input.situacion.estado === "PAID" ? input.situacion.fechaPago : null,
  };
}
function moneyPatch(value: z.infer<typeof money>) {
  return value.moneda === "USD"
    ? { amountUsd: value.monto, amountArs: null, exchangeRate: null }
    : { amountUsd: null, amountArs: value.monto, exchangeRate: value.tipoCambio };
}

const incomeCreate = z.object({ concepto: text, typeId: uuid, projectId: uuid.nullable().optional(), clientId: uuid.nullable().optional(), dinero: money, situacion: z.union([pending, paidIncome]) }).strict();
const incomeUpdate = z.object({ incomeId: uuid, concepto: text.optional(), typeId: uuid.optional(), projectId: uuid.nullable().optional(), clientId: uuid.nullable().optional(), dinero: money.optional(), situacion: z.union([pending, paidIncome]).optional() }).strict().refine((value) => Object.keys(value).length > 1, "Debe indicar un cambio");
const expenseCreate = z.object({ concepto: text, categoryId: uuid, projectId: uuid.nullable().optional(), tipo: z.enum(["FIXED", "VARIABLE"]), dinero: money, situacion: z.union([pending, paidExpense]) }).strict();
const expenseUpdate = z.object({ expenseId: uuid, concepto: text.optional(), categoryId: uuid.optional(), projectId: uuid.nullable().optional(), tipo: z.enum(["FIXED", "VARIABLE"]).optional(), dinero: money.optional(), situacion: z.union([pending, paidExpense]).optional() }).strict().refine((value) => Object.keys(value).length > 1, "Debe indicar un cambio");

export function registerCatalogReadTools(server: McpServer) {
  server.registerTool("consultar_tipos_ingreso", { title: "Consultar tipos de ingreso", description: "Lista tipos de ingreso sin datos privados.", inputSchema: z.object({ pagina: z.number().int().min(1).default(1), limite: z.number().int().min(1).max(50).default(20) }).strict(), ...readMetadata }, async (input, ctx) => {
    try {
      await requireMcpAdmin(ctx);
      const rows = await listIncomeTypes(); const start = (input.pagina - 1) * input.limite;
      return result({ pagina: input.pagina, limite: input.limite, hayMas: rows.length > start + input.limite, tipos: rows.slice(start, start + input.limite).map((row) => ({ id: row.id, nombre: row.name, requiereProyecto: row.requiresProject, activo: row.isActive, cantidadIngresos: row._count.incomes })) });
    } catch (error) { return errorResult(error); }
  });
  server.registerTool("consultar_categorias_gasto", { title: "Consultar categorías de gasto", description: "Lista categorías de gasto sin datos privados.", inputSchema: z.object({ pagina: z.number().int().min(1).default(1), limite: z.number().int().min(1).max(50).default(20) }).strict(), ...readMetadata }, async (input, ctx) => {
    try {
      await requireMcpAdmin(ctx);
      const rows = await listCategories(); const start = (input.pagina - 1) * input.limite;
      return result({ pagina: input.pagina, limite: input.limite, hayMas: rows.length > start + input.limite, categorias: rows.slice(start, start + input.limite).map((row) => ({ id: row.id, nombre: row.name, activo: row.isActive, cantidadGastos: row._count.expenses })) });
    } catch (error) { return errorResult(error); }
  });
}

export function registerWriteTools(server: McpServer) {
  const call = <T>(operation: string, entity: string, fn: (input: T, ctx: ServerContext) => Promise<Record<string, unknown>>) => async (input: T, ctx: ServerContext) => {
    try {
      const actor = await requireMcpWriteActor(ctx);
      if (actor.role !== "ADMIN") {
        throw new McpAuthorizationError("FORBIDDEN", "No tenés acceso a esta operación en Broco App.");
      }
      return result(await fn(input, ctx));
    } catch (error) { return errorResult(error); }
  };
  server.registerTool("crear_ingreso", { title: "Crear ingreso", description: "Crea un ingreso financiero.", inputSchema: incomeCreate, ...writeMetadata() }, call("crear_ingreso", "income", async (input, ctx) => { const created = await createIncome(incomeInput(input)); const row = await getIncome(created.id); audit(ctx, "crear_ingreso", "income", row.id, ["concepto", "tipo", "dinero", "situacion"]); return { operacion: "creado", ingreso: toFlowIncomeDto(row, today()) }; }));
  server.registerTool("actualizar_ingreso", { title: "Actualizar ingreso", description: "Actualiza campos controlados de un ingreso.", inputSchema: incomeUpdate, ...writeMetadata(false, true) }, call("actualizar_ingreso", "income", async (input, ctx) => { const patch: any = {}; if (input.concepto !== undefined) patch.concept = input.concepto; if (input.typeId !== undefined) patch.typeId = input.typeId; if (input.projectId !== undefined) patch.projectId = input.projectId; if (input.clientId !== undefined) patch.clientId = input.clientId; if (input.dinero) Object.assign(patch, moneyPatch(input.dinero)); if (input.situacion) { patch.status = input.situacion.estado; patch.dueDate = input.situacion.vencimiento ?? null; patch.effectiveDate = input.situacion.estado === "PAID" ? input.situacion.fechaCobro : null; } const updated = await patchIncomeForMcp(input.incomeId, patch); const row = await getIncome(updated.id); audit(ctx, "actualizar_ingreso", "income", row.id, Object.keys(input).filter((key) => key !== "incomeId")); return { operacion: "actualizado", ingreso: toFlowIncomeDto(row, today()) }; }));
  server.registerTool("marcar_ingreso_cobrado", { title: "Marcar ingreso cobrado", description: "Marca un ingreso como cobrado con fecha efectiva.", inputSchema: z.object({ incomeId: uuid, fechaCobro: date }).strict(), ...writeMetadata(false, true) }, call("marcar_ingreso_cobrado", "income", async (input, ctx) => { await markIncomePaidForMcp(input.incomeId, input.fechaCobro); const row = await getIncome(input.incomeId); audit(ctx, "marcar_ingreso_cobrado", "income", row.id, ["estado", "fechaCobro"]); return { operacion: "cobrado", ingreso: toFlowIncomeDto(row, today()) }; }));
  server.registerTool("eliminar_ingreso", { title: "Eliminar ingreso", description: "Elimina físicamente un ingreso confirmado.", inputSchema: z.object({ incomeId: uuid, confirmarEliminacion: z.boolean().optional() }).strict(), ...writeMetadata(true) }, call("eliminar_ingreso", "income", async (input, ctx) => { requireDeletionConfirmation(input.confirmarEliminacion); const row = await getIncome(input.incomeId); await deleteIncome(input.incomeId); audit(ctx, "eliminar_ingreso", "income", row.id, []); return { operacion: "eliminado", entidad: "ingreso", id: row.id }; }));
  server.registerTool("crear_gasto", { title: "Crear gasto", description: "Crea un gasto financiero.", inputSchema: expenseCreate, ...writeMetadata() }, call("crear_gasto", "expense", async (input, ctx) => { const created = await createExpense(expenseInput(input)); const row = await getExpense(created.id); audit(ctx, "crear_gasto", "expense", row.id, ["concepto", "categoria", "dinero", "situacion"]); return { operacion: "creado", gasto: toFlowExpenseDto(row, today()) }; }));
  server.registerTool("actualizar_gasto", { title: "Actualizar gasto", description: "Actualiza campos controlados de un gasto.", inputSchema: expenseUpdate, ...writeMetadata(false, true) }, call("actualizar_gasto", "expense", async (input, ctx) => { const patch: any = {}; if (input.concepto !== undefined) patch.concept = input.concepto; if (input.categoryId !== undefined) patch.expenseCategoryId = input.categoryId; if (input.projectId !== undefined) patch.projectId = input.projectId; if (input.tipo !== undefined) patch.type = input.tipo; if (input.dinero) Object.assign(patch, moneyPatch(input.dinero)); if (input.situacion) { patch.status = input.situacion.estado; patch.dueDate = input.situacion.vencimiento ?? null; patch.effectiveDate = input.situacion.estado === "PAID" ? input.situacion.fechaPago : null; } const updated = await patchExpenseForMcp(input.expenseId, patch); const row = await getExpense(updated.id); audit(ctx, "actualizar_gasto", "expense", row.id, Object.keys(input).filter((key) => key !== "expenseId")); return { operacion: "actualizado", gasto: toFlowExpenseDto(row, today()) }; }));
  server.registerTool("marcar_gasto_pagado", { title: "Marcar gasto pagado", description: "Marca un gasto como pagado con fecha efectiva.", inputSchema: z.object({ expenseId: uuid, fechaPago: date }).strict(), ...writeMetadata(false, true) }, call("marcar_gasto_pagado", "expense", async (input, ctx) => { await markExpensePaidForMcp(input.expenseId, input.fechaPago); const row = await getExpense(input.expenseId); audit(ctx, "marcar_gasto_pagado", "expense", row.id, ["estado", "fechaPago"]); return { operacion: "pagado", gasto: toFlowExpenseDto(row, today()) }; }));
  server.registerTool("eliminar_gasto", { title: "Eliminar gasto", description: "Elimina físicamente un gasto confirmado.", inputSchema: z.object({ expenseId: uuid, confirmarEliminacion: z.boolean().optional() }).strict(), ...writeMetadata(true) }, call("eliminar_gasto", "expense", async (input, ctx) => { requireDeletionConfirmation(input.confirmarEliminacion); const row = await getExpense(input.expenseId); await deleteExpense(input.expenseId); audit(ctx, "eliminar_gasto", "expense", row.id, []); return { operacion: "eliminado", entidad: "gasto", id: row.id }; }));
  server.registerTool("crear_tipo_ingreso", { title: "Crear tipo de ingreso", description: "Crea un tipo de ingreso.", inputSchema: z.object({ nombre: text, requiereProyecto: z.boolean() }).strict(), ...writeMetadata() }, call("crear_tipo_ingreso", "income_type", async (input, ctx) => { const row = await createIncomeType({ name: input.nombre, requiresProject: input.requiereProyecto }); audit(ctx, "crear_tipo_ingreso", "income_type", row.id, ["nombre", "requiereProyecto"]); return { operacion: "creado", tipo: { id: row.id, nombre: row.name, requiereProyecto: row.requiresProject, activo: row.isActive } }; }));
  server.registerTool("actualizar_tipo_ingreso", { title: "Actualizar tipo de ingreso", description: "Renombra o ajusta la regla de proyecto de un tipo.", inputSchema: z.object({ typeId: uuid, nombre: text.optional(), requiereProyecto: z.boolean().optional() }).strict().refine((x) => x.nombre !== undefined || x.requiereProyecto !== undefined), ...writeMetadata(false, true) }, call("actualizar_tipo_ingreso", "income_type", async (input, ctx) => { const current = (await listIncomeTypes()).find((x) => x.id === input.typeId); if (!current) throw new Error("Tipo no encontrado."); const row = await updateIncomeType(input.typeId, { name: input.nombre ?? current.name, requiresProject: input.requiereProyecto ?? current.requiresProject }); audit(ctx, "actualizar_tipo_ingreso", "income_type", row.id, Object.keys(input).filter((x) => x !== "typeId")); return { operacion: "actualizado", tipo: { id: row.id, nombre: row.name, requiereProyecto: row.requiresProject, activo: row.isActive } }; }));
  server.registerTool("eliminar_tipo_ingreso", { title: "Eliminar tipo de ingreso", description: "Elimina un tipo de ingreso sin movimientos asociados.", inputSchema: z.object({ typeId: uuid, confirmarEliminacion: z.boolean().optional() }).strict(), ...writeMetadata(true) }, call("eliminar_tipo_ingreso", "income_type", async (input, ctx) => { requireDeletionConfirmation(input.confirmarEliminacion); await deleteIncomeType(input.typeId); audit(ctx, "eliminar_tipo_ingreso", "income_type", input.typeId, []); return { operacion: "eliminado", entidad: "tipo_ingreso", id: input.typeId }; }));
  server.registerTool("crear_categoria_gasto", { title: "Crear categoría de gasto", description: "Crea una categoría de gasto.", inputSchema: z.object({ nombre: text }).strict(), ...writeMetadata() }, call("crear_categoria_gasto", "expense_category", async (input, ctx) => { const row = await createCategory({ name: input.nombre }); audit(ctx, "crear_categoria_gasto", "expense_category", row.id, ["nombre"]); return { operacion: "creado", categoria: { id: row.id, nombre: row.name, activo: row.isActive } }; }));
  server.registerTool("actualizar_categoria_gasto", { title: "Actualizar categoría de gasto", description: "Renombra una categoría de gasto.", inputSchema: z.object({ categoryId: uuid, nombre: text }).strict(), ...writeMetadata(false, true) }, call("actualizar_categoria_gasto", "expense_category", async (input, ctx) => { const row = await updateCategory(input.categoryId, { name: input.nombre }); audit(ctx, "actualizar_categoria_gasto", "expense_category", row.id, ["nombre"]); return { operacion: "actualizado", categoria: { id: row.id, nombre: row.name, activo: row.isActive } }; }));
  server.registerTool("eliminar_categoria_gasto", { title: "Eliminar categoría de gasto", description: "Elimina una categoría sin gastos asociados.", inputSchema: z.object({ categoryId: uuid, confirmarEliminacion: z.boolean().optional() }).strict(), ...writeMetadata(true) }, call("eliminar_categoria_gasto", "expense_category", async (input, ctx) => { requireDeletionConfirmation(input.confirmarEliminacion); await deleteCategory(input.categoryId); audit(ctx, "eliminar_categoria_gasto", "expense_category", input.categoryId, []); return { operacion: "eliminado", entidad: "categoria_gasto", id: input.categoryId }; }));
  const phaseCreate = z.object({ projectId: uuid, nombre: text }).strict();
  server.registerTool("crear_fase_proyecto", { title: "Crear fase", description: "Agrega una fase al final del proyecto.", inputSchema: phaseCreate, ...writeMetadata() }, call("crear_fase_proyecto", "project_phase", async (input, ctx) => { const row = await createPhase({ projectId: input.projectId, name: input.nombre }); audit(ctx, "crear_fase_proyecto", "project_phase", row.id, ["nombre"]); return { operacion: "creado", fase: { id: row.id, projectId: row.projectId, nombre: row.name, orden: row.position } }; }));
  server.registerTool("actualizar_fase_proyecto", { title: "Actualizar fase", description: "Renombra una fase de proyecto.", inputSchema: z.object({ projectId: uuid, phaseId: uuid, nombre: text }).strict(), ...writeMetadata(false, true) }, call("actualizar_fase_proyecto", "project_phase", async (input, ctx) => { await assertPhaseProject(input.phaseId, input.projectId); const row = await updatePhase(input.phaseId, { name: input.nombre }); audit(ctx, "actualizar_fase_proyecto", "project_phase", row.id, ["nombre"]); return { operacion: "actualizado", fase: { id: row.id, projectId: row.projectId, nombre: row.name, orden: row.position } }; }));
  server.registerTool("reordenar_fases_proyecto", { title: "Reordenar fases", description: "Reordena la lista completa de fases del proyecto.", inputSchema: z.object({ projectId: uuid, phaseIdsOrdenados: z.array(uuid).min(1).max(50) }).strict(), ...writeMetadata(false, true) }, call("reordenar_fases_proyecto", "project_phase", async (input, ctx) => { await reorderProjectPhases(input.projectId, input.phaseIdsOrdenados); audit(ctx, "reordenar_fases_proyecto", "project_phase", input.projectId, ["orden"]); return { operacion: "reordenado", projectId: input.projectId, phaseIdsOrdenados: input.phaseIdsOrdenados }; }));
  server.registerTool("eliminar_fase_proyecto", { title: "Eliminar fase", description: "Elimina una fase y deja sus tareas sin fase.", inputSchema: z.object({ projectId: uuid, phaseId: uuid, confirmarEliminacion: z.boolean().optional() }).strict(), ...writeMetadata(true) }, call("eliminar_fase_proyecto", "project_phase", async (input, ctx) => { requireDeletionConfirmation(input.confirmarEliminacion); await assertPhaseProject(input.phaseId, input.projectId); const row = await deletePhase(input.phaseId); audit(ctx, "eliminar_fase_proyecto", "project_phase", row.id, []); return { operacion: "eliminado", entidad: "fase", id: row.id, tareasDesvinculadas: row.affectedTasks }; }));
  const taskCreate = z.object({ projectId: uuid, phaseId: uuid.nullable().optional(), nombre: text, descripcion: description, tipo: z.enum(["TASK", "MILESTONE"]), inicio: date, fin: date.optional(), estado: z.enum(TASK_STATUSES).optional(), clientVisible: z.boolean().optional() }).strict().superRefine((x, ctx) => { if (x.tipo === "TASK" && !x.fin) ctx.addIssue({ code: "custom", path: ["fin"], message: "TASK requiere fecha de fin" }); });
  server.registerTool("crear_tarea_proyecto", { title: "Crear tarea o hito", description: "Crea una tarea o hito; por defecto queda oculto del portal cliente.", inputSchema: taskCreate, ...writeMetadata() }, call("crear_tarea_proyecto", "project_task", async (input, ctx) => { const row = await createTask({ projectId: input.projectId, phaseId: input.phaseId ?? null, name: input.nombre, description: input.descripcion, type: input.tipo, startDate: input.inicio, endDate: input.fin ?? input.inicio, status: input.estado, clientVisible: input.clientVisible ?? false }); const task = await getTask(row.id); audit(ctx, "crear_tarea_proyecto", "project_task", row.id, ["nombre", "tipo", "fechas", "clientVisible"]); return { operacion: "creado", tarea: toPlanningTaskDto(task, today()) }; }));
  const taskUpdate = z.object({ projectId: uuid, taskId: uuid, nombre: text.optional(), descripcion: description, tipo: z.enum(["TASK", "MILESTONE"]).optional(), inicio: date.optional(), fin: date.optional(), clientVisible: z.boolean().optional() }).strict().superRefine((x, ctx) => {
    if (Object.keys(x).length <= 2) ctx.addIssue({ code: "custom", message: "Debe indicar un cambio" });
    if (x.tipo === "TASK" && !x.fin) ctx.addIssue({ code: "custom", path: ["fin"], message: "Al convertir a TASK debe indicar fecha de fin" });
  });
  server.registerTool("actualizar_tarea_proyecto", { title: "Actualizar tarea o hito", description: "Actualiza contenido, fechas, tipo o visibilidad de portal.", inputSchema: taskUpdate, ...writeMetadata(false, true) }, call("actualizar_tarea_proyecto", "project_task", async (input, ctx) => { await assertTaskProject(input.taskId, input.projectId); const row = await updateTask(input.taskId, { name: input.nombre, description: input.descripcion, type: input.tipo, startDate: input.inicio, endDate: input.fin }); if (input.clientVisible !== undefined) await setTaskClientVisible(row.id, input.clientVisible); const task = await getTask(row.id); audit(ctx, "actualizar_tarea_proyecto", "project_task", row.id, Object.keys(input).filter((x) => !["projectId", "taskId"].includes(x))); return { operacion: "actualizado", tarea: toPlanningTaskDto(task, today()) }; }));
  server.registerTool("cambiar_estado_tarea", { title: "Cambiar estado de tarea", description: "Cambia el estado de una tarea o hito.", inputSchema: z.object({ projectId: uuid, taskId: uuid, estado: z.enum(TASK_STATUSES) }).strict(), ...writeMetadata(false, true) }, call("cambiar_estado_tarea", "project_task", async (input, ctx) => { await assertTaskProject(input.taskId, input.projectId); const row = await setTaskStatus(input.taskId, input.estado); audit(ctx, "cambiar_estado_tarea", "project_task", row.id, ["estado"]); return { operacion: "actualizado", id: row.id, estado: row.status }; }));
  server.registerTool("mover_tarea_de_fase", { title: "Mover tarea de fase", description: "Mueve una tarea al final de la fase destino.", inputSchema: z.object({ projectId: uuid, taskId: uuid, phaseId: uuid.nullable() }).strict(), ...writeMetadata(false, true) }, call("mover_tarea_de_fase", "project_task", async (input, ctx) => { await assertTaskProject(input.taskId, input.projectId); const row = await setTaskPhase(input.taskId, input.phaseId); audit(ctx, "mover_tarea_de_fase", "project_task", row.id, ["fase", "orden"]); return { operacion: "movido", id: row.id, phaseId: row.phaseId, orden: row.position }; }));
  server.registerTool("reordenar_tareas_proyecto", { title: "Reordenar tareas", description: "Reordena la lista completa de tareas de una fase.", inputSchema: z.object({ projectId: uuid, phaseId: uuid.nullable(), taskIdsOrdenados: z.array(uuid).min(1).max(50) }).strict(), ...writeMetadata(false, true) }, call("reordenar_tareas_proyecto", "project_task", async (input, ctx) => { await reorderProjectTasks(input.projectId, input.phaseId, input.taskIdsOrdenados); audit(ctx, "reordenar_tareas_proyecto", "project_task", input.projectId, ["orden"]); return { operacion: "reordenado", projectId: input.projectId, phaseId: input.phaseId, taskIdsOrdenados: input.taskIdsOrdenados }; }));
  server.registerTool("eliminar_tarea_proyecto", { title: "Eliminar tarea o hito", description: "Elimina físicamente una tarea o hito confirmado.", inputSchema: z.object({ projectId: uuid, taskId: uuid, confirmarEliminacion: z.boolean().optional() }).strict(), ...writeMetadata(true) }, call("eliminar_tarea_proyecto", "project_task", async (input, ctx) => { requireDeletionConfirmation(input.confirmarEliminacion); const task = await assertTaskProject(input.taskId, input.projectId); await deleteTask(input.taskId); audit(ctx, "eliminar_tarea_proyecto", "project_task", task.id, []); return { operacion: "eliminado", entidad: task.type === "MILESTONE" ? "hito" : "tarea", id: task.id, projectId: input.projectId }; }));
}
