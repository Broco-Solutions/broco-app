import type { McpServer, ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod";
import { isValidCalendarDateKey, todayKeyArgentina } from "@/lib/dates";
import { parseTimeDurationFields } from "@/lib/time-duration";
import {
  changeOperationalTaskStatus,
  createOperationalTask,
  listOperationalTasks,
  updateOperationalTask,
} from "@/server/services/operational-tasks";
import {
  createTimeEntry,
  createTimeEntryForOperationalTask,
  listHourOptions,
  listTimeEntries,
  updateTimeEntry,
  voidTimeEntry,
} from "@/server/services/hours";
import {
  mcpErrorResult,
  requireMcpActor,
  requireMcpAdmin,
  requireMcpWriteActor,
} from "@/server/mcp/identity";
import { listUsersForMcp } from "@/server/services/users";

export const OPERATIONAL_MCP_READ_TOOL_NAMES = [
  "consultar_usuarios",
  "consultar_tareas_operativas",
  "consultar_proyectos_operativos",
  "consultar_tiempos",
] as const;

export const OPERATIONAL_MCP_WRITE_TOOL_NAMES = [
  "crear_tarea_operativa",
  "actualizar_tarea_operativa",
  "cambiar_estado_tarea_operativa",
  "registrar_tiempo",
  "actualizar_tiempo",
  "anular_tiempo",
] as const;

const uuid = z.string().uuid("Identificador inválido.");
const date = z.string().refine(isValidCalendarDateKey, "Fecha inválida.");
const page = z.number().int().min(1).max(1_000).default(1);
const limit = z.number().int().min(1).max(50).default(20);
const taskStatus = z.enum(["PENDING", "IN_PROGRESS", "BLOCKED", "DONE"]);
const hours = z.number().int().min(0).max(24).optional();
const minutes = z.number().int().min(0).max(59).optional();
const writeMetadata = {
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  _meta: { securitySchemes: [{ type: "oauth2", scopes: ["mcp:read", "mcp:write"] }] },
};
const readMetadata = {
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  _meta: { securitySchemes: [{ type: "oauth2", scopes: ["mcp:read"] }] },
};

function result(data: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

function dateKey(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function taskDto(task: Awaited<ReturnType<typeof listOperationalTasks>>[number]) {
  const today = todayKeyArgentina();
  const due = dateKey(task.dueDate);
  return {
    id: task.id,
    titulo: task.title,
    descripcion: task.description,
    referenciaUrl: task.referenceUrl,
    estado: task.status,
    vencimiento: due,
    vencida: Boolean(due && due < today && task.status !== "DONE"),
    motivoBloqueo: task.blockedReason,
    completadaEn: task.completedAt?.toISOString() ?? null,
    creadaEn: task.createdAt.toISOString(),
    actualizadaEn: task.updatedAt.toISOString(),
    creador: { id: task.creator.id, nombre: task.creator.name },
    responsable: { id: task.assignee.id, nombre: task.assignee.name },
    proyecto: task.project
      ? { id: task.project.id, nombre: task.project.name, cliente: { id: task.project.client.id, nombre: task.project.client.name } }
      : null,
    tiempoMinutos: task.timeMinutes,
  };
}

function timeDto(entry: Awaited<ReturnType<typeof listTimeEntries>>[number]) {
  return {
    id: entry.id,
    usuario: { id: entry.userId, nombre: entry.user.name },
    fecha: entry.workDate.toISOString().slice(0, 10),
    minutos: entry.minutes,
    descripcion: entry.description,
    estado: entry.status,
    motivoAnulacion: entry.voidReason ?? null,
    actualizadaEn: entry.updatedAt.toISOString(),
    proyecto: { id: entry.projectId, nombre: entry.project.name, cliente: { id: entry.project.client.id, nombre: entry.project.client.name } },
    tareaOperativa: entry.operationalTask ? { id: entry.operationalTask.id, titulo: entry.operationalTask.title } : null,
  };
}

function pagination<T>(rows: T[], pagina: number, limite: number) {
  const start = (pagina - 1) * limite;
  return { pagina, limite, hayMas: rows.length > start + limite, rows: rows.slice(start, start + limite) };
}

async function read<T>(ctx: ServerContext, fn: (actor: Awaited<ReturnType<typeof requireMcpActor>>) => Promise<T>) {
  try {
    return result(await fn(await requireMcpActor(ctx)) as Record<string, unknown>);
  } catch (error) {
    return mcpErrorResult(error);
  }
}

async function write<T>(ctx: ServerContext, fn: (actor: Awaited<ReturnType<typeof requireMcpWriteActor>>) => Promise<T>) {
  try {
    return result(await fn(await requireMcpWriteActor(ctx)) as Record<string, unknown>);
  } catch (error) {
    return mcpErrorResult(error);
  }
}

async function adminRead<T>(ctx: ServerContext, fn: (actor: Awaited<ReturnType<typeof requireMcpAdmin>>) => Promise<T>) {
  try {
    return result(await fn(await requireMcpAdmin(ctx)) as Record<string, unknown>);
  } catch (error) {
    return mcpErrorResult(error);
  }
}

export function registerOperationalTools(
  server: McpServer,
  options: { writeEnabled?: boolean } = {},
) {
  server.registerTool(
    "consultar_usuarios",
    {
      title: "Consultar usuarios",
      description: "Busca usuarios activos o inactivos por nombre o email. Sólo ADMIN puede consultar el listado y los datos devueltos son operativos mínimos.",
      inputSchema: z.object({ texto: z.string().trim().min(1).max(200).optional(), activo: z.boolean().optional(), rol: z.enum(["ADMIN", "COLLABORATOR"]).optional(), pagina: page, limite: limit }).strict(),
      ...readMetadata,
    },
    async (input, ctx) => adminRead(ctx, async () => {
      const rows = await listUsersForMcp({ search: input.texto, isActive: input.activo, role: input.rol, skip: (input.pagina - 1) * input.limite, take: input.limite + 1 });
      return {
        pagina: input.pagina,
        limite: input.limite,
        hayMas: rows.length > input.limite,
        usuarios: rows.slice(0, input.limite).map((user) => ({ id: user.id, nombre: user.name, email: user.email, rol: user.role, activo: user.isActive })),
      };
    }),
  );

  server.registerTool(
    "consultar_tareas_operativas",
    {
      title: "Consultar tareas operativas",
      description: "Lista las tareas operativas visibles para el usuario actual. Un colaborador siempre queda limitado a sus propias tareas.",
      inputSchema: z.object({
        taskId: uuid.optional(), texto: z.string().trim().min(1).max(300).optional(), estado: taskStatus.optional(), projectId: uuid.optional(),
        desdeVencimiento: date.optional(), hastaVencimiento: date.optional(), vencidas: z.boolean().optional(), assigneeId: uuid.optional(), pagina: page, limite: limit,
      }).strict().superRefine((value, ctx) => {
        if ((value.desdeVencimiento === undefined) !== (value.hastaVencimiento === undefined)) ctx.addIssue({ code: "custom", message: "Desde y hasta deben enviarse juntos." });
        if (value.desdeVencimiento && value.hastaVencimiento && value.desdeVencimiento > value.hastaVencimiento) ctx.addIssue({ code: "custom", path: ["hastaVencimiento"], message: "El rango de vencimiento es inválido." });
      }),
      ...readMetadata,
    },
    async (input, ctx) => read(ctx, async (actor) => {
      const tasks = await listOperationalTasks(actor, {
        search: input.texto,
        status: input.estado,
        projectId: input.projectId,
        assigneeId: actor.role === "ADMIN" ? input.assigneeId : undefined,
      });
      const filtered = tasks.filter((task) => {
        const due = dateKey(task.dueDate);
        if (input.taskId && task.id !== input.taskId) return false;
        if (input.vencidas && !(due && due < todayKeyArgentina() && task.status !== "DONE")) return false;
        if (input.desdeVencimiento && (!due || due < input.desdeVencimiento)) return false;
        if (input.hastaVencimiento && (!due || due > input.hastaVencimiento)) return false;
        return true;
      });
      const pageResult = pagination(filtered, input.pagina, input.limite);
      return { pagina: pageResult.pagina, limite: pageResult.limite, hayMas: pageResult.hayMas, tareas: pageResult.rows.map(taskDto) };
    }),
  );

  server.registerTool(
    "consultar_proyectos_operativos",
    {
      title: "Consultar proyectos operativos",
      description: "Lista el contexto mínimo de proyectos habilitados para cargar tiempo, sin importes ni datos financieros.",
      inputSchema: z.object({ pagina: page, limite: limit }).strict(),
      ...readMetadata,
    },
    async (input, ctx) => read(ctx, async (actor) => {
      const rows = await listHourOptions(actor);
      const pageResult = pagination(rows, input.pagina, input.limite);
      return {
        pagina: pageResult.pagina,
        limite: pageResult.limite,
        hayMas: pageResult.hayMas,
        proyectos: pageResult.rows.map((project) => ({ id: project.id, nombre: project.name, cliente: { id: project.client.id, nombre: project.client.name } })),
      };
    }),
  );

  server.registerTool(
    "consultar_tiempos",
    {
      title: "Consultar tiempos",
      description: "Lista registros de tiempo del usuario actual o, para ADMIN, del usuario filtrado. No incluye datos financieros.",
      inputSchema: z.object({ desde: date.optional(), hasta: date.optional(), projectId: uuid.optional(), operationalTaskId: uuid.optional(), userId: uuid.optional(), estado: z.enum(["ACTIVE", "VOID"]).optional(), pagina: page, limite: limit }).strict().superRefine((value, ctx) => {
        if ((value.desde === undefined) !== (value.hasta === undefined)) ctx.addIssue({ code: "custom", message: "Desde y hasta deben enviarse juntos." });
        if (value.desde && value.hasta && value.desde > value.hasta) ctx.addIssue({ code: "custom", path: ["hasta"], message: "El rango es inválido." });
      }),
      ...readMetadata,
    },
    async (input, ctx) => read(ctx, async (actor) => {
      const today = todayKeyArgentina();
      const from = input.desde ?? new Date(`${today}T00:00:00Z`).toISOString().slice(0, 10);
      const to = input.hasta ?? today;
      const entries = await listTimeEntries(actor, { from, to, projectId: input.projectId, operationalTaskId: input.operationalTaskId, userId: actor.role === "ADMIN" ? input.userId : undefined });
      const filtered = input.estado ? entries.filter((entry) => entry.status === input.estado) : entries;
      const pageResult = pagination(filtered, input.pagina, input.limite);
      return { pagina: pageResult.pagina, limite: pageResult.limite, hayMas: pageResult.hayMas, tiempos: pageResult.rows.map(timeDto) };
    }),
  );

  if (!options.writeEnabled) return;

  server.registerTool(
    "crear_tarea_operativa",
    { title: "Crear tarea operativa", description: "Crea una tarea operativa. COLLABORATOR siempre crea y asigna la tarea para sí mismo.", inputSchema: z.object({ titulo: z.string().trim().min(1).max(300), descripcion: z.string().trim().max(10_000).nullable().optional(), referenciaUrl: z.string().trim().url().max(2_000).nullable().optional(), projectId: uuid.nullable().optional(), vencimiento: date.nullable().optional(), assigneeId: uuid.optional() }).strict(), ...writeMetadata },
    async (input, ctx) => write(ctx, async (actor) => {
      const task = await createOperationalTask(actor, { title: input.titulo, description: input.descripcion, referenceUrl: input.referenciaUrl, projectId: input.projectId, dueDate: input.vencimiento, assigneeId: actor.role === "ADMIN" ? input.assigneeId : undefined });
      const listed = await listOperationalTasks(actor, { assigneeId: actor.role === "ADMIN" ? task.assigneeId : undefined });
      const full = listed.find((item) => item.id === task.id);
      return { operacion: "creada", tarea: full ? taskDto(full) : { id: task.id, actualizadaEn: task.updatedAt.toISOString() } };
    }),
  );

  server.registerTool(
    "actualizar_tarea_operativa",
    { title: "Actualizar tarea operativa", description: "Actualiza campos controlados de una tarea propia o, para ADMIN, de cualquier tarea.", inputSchema: z.object({ taskId: uuid, titulo: z.string().trim().min(1).max(300).optional(), descripcion: z.string().trim().max(10_000).nullable().optional(), referenciaUrl: z.string().trim().url().max(2_000).nullable().optional(), projectId: uuid.nullable().optional(), vencimiento: date.nullable().optional(), assigneeId: uuid.optional(), expectedUpdatedAt: z.string().datetime() }).strict().refine((value) => Object.keys(value).length > 2, "Debe indicar un cambio."), ...writeMetadata },
    async (input, ctx) => write(ctx, async (actor) => {
      const task = await updateOperationalTask(actor, input.taskId, { title: input.titulo, description: input.descripcion, referenceUrl: input.referenciaUrl, projectId: input.projectId, dueDate: input.vencimiento, assigneeId: actor.role === "ADMIN" ? input.assigneeId : undefined, expectedUpdatedAt: input.expectedUpdatedAt });
      const listed = await listOperationalTasks(actor, { assigneeId: actor.role === "ADMIN" ? task.assigneeId : undefined });
      const full = listed.find((item) => item.id === task.id);
      return { operacion: "actualizada", tarea: full ? taskDto(full) : { id: task.id, actualizadaEn: task.updatedAt.toISOString() } };
    }),
  );

  server.registerTool(
    "cambiar_estado_tarea_operativa",
    { title: "Cambiar estado de tarea operativa", description: "Cambia entre PENDING, IN_PROGRESS, BLOCKED y DONE. BLOCKED requiere motivo.", inputSchema: z.object({ taskId: uuid, estado: taskStatus, motivoBloqueo: z.string().trim().max(4_000).nullable().optional(), expectedUpdatedAt: z.string().datetime() }).strict(), ...writeMetadata },
    async (input, ctx) => write(ctx, async (actor) => {
      const changed = await changeOperationalTaskStatus(actor, input.taskId, { status: input.estado, blockedReason: input.motivoBloqueo, expectedUpdatedAt: input.expectedUpdatedAt });
      const listed = await listOperationalTasks(actor, { assigneeId: actor.role === "ADMIN" ? changed.task.assigneeId : undefined });
      const full = listed.find((item) => item.id === changed.task.id);
      return { operacion: "actualizada", tarea: full ? taskDto(full) : { id: changed.task.id, estado: changed.task.status, actualizadaEn: changed.task.updatedAt.toISOString() } };
    }),
  );

  const directTimeSchema = z.object({ projectId: uuid, fecha: date, hours, minutes, descripcion: z.string().trim().min(1).max(2_000), userId: uuid.optional(), idempotencyKey: uuid }).strict();
  const taskTimeSchema = z.object({ operationalTaskId: uuid, fecha: date, hours, minutes, detalle: z.string().trim().max(1_600).nullable().optional(), idempotencyKey: uuid }).strict();
  server.registerTool(
    "registrar_tiempo",
    { title: "Registrar tiempo", description: "Registra un TimeEntry real. Con tarea operativa deriva proyecto, responsable y descripción base.", inputSchema: z.union([directTimeSchema, taskTimeSchema]), ...writeMetadata },
    async (input, ctx) => write(ctx, async (actor) => {
      const totalMinutes = parseTimeDurationFields(input.hours, input.minutes);
      const entry = "operationalTaskId" in input
        ? await createTimeEntryForOperationalTask(actor, { taskId: input.operationalTaskId, workDate: input.fecha, minutes: totalMinutes, additionalDetail: input.detalle, idempotencyKey: input.idempotencyKey })
        : await createTimeEntry(actor, { userId: actor.role === "ADMIN" ? input.userId ?? actor.id : actor.id, projectId: input.projectId, workDate: input.fecha, minutes: totalMinutes, description: input.descripcion, referenceUrl: null, idempotencyKey: input.idempotencyKey });
      return { operacion: "registrado", tiempo: { id: entry.id, minutos: entry.minutes, descripcion: entry.description, fecha: entry.workDate.toISOString().slice(0, 10), projectId: entry.projectId, operationalTaskId: entry.operationalTaskId ?? null } };
    }),
  );

  server.registerTool(
    "actualizar_tiempo",
    { title: "Actualizar tiempo", description: "Corrige un TimeEntry existente con CAS, auditoría y las mismas reglas de la aplicación.", inputSchema: z.object({ timeEntryId: uuid, projectId: uuid, fecha: date, hours, minutes, descripcion: z.string().trim().min(1).max(2_000), referenciaUrl: z.string().trim().url().max(2_000).nullable().optional(), motivo: z.string().trim().max(2_000).optional(), expectedUpdatedAt: z.string().datetime() }).strict(), ...writeMetadata },
    async (input, ctx) => write(ctx, async (actor) => {
      const totalMinutes = parseTimeDurationFields(input.hours, input.minutes);
      const entry = await updateTimeEntry(actor, input.timeEntryId, { projectId: input.projectId, workDate: input.fecha, minutes: totalMinutes, description: input.descripcion, referenceUrl: input.referenciaUrl }, input.motivo ?? "", input.expectedUpdatedAt);
      return { operacion: "actualizado", tiempo: { id: entry.id, minutos: entry.minutes, actualizadaEn: entry.updatedAt.toISOString() } };
    }),
  );

  server.registerTool(
    "anular_tiempo",
    { title: "Anular tiempo", description: "Anula lógicamente un TimeEntry y conserva su auditoría.", inputSchema: z.object({ timeEntryId: uuid, motivo: z.string().trim().min(1).max(2_000) }).strict(), ...writeMetadata },
    async (input, ctx) => write(ctx, async (actor) => {
      const entry = await voidTimeEntry(actor, input.timeEntryId, input.motivo);
      return { operacion: "anulado", tiempo: { id: entry.id, estado: entry.status, motivoAnulacion: entry.voidReason } };
    }),
  );
}
