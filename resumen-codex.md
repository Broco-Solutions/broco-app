> HISTÓRICO / NO OPERATIVO. Registro de auditorías anteriores; no describe
> necesariamente el runtime actual ni autoriza operaciones sobre producción.

## Resumen ejecutivo

  El feature Kanban vive en una ruta y servicio dedicados, no entra por finance.ts como entrypoint principal.
  El flujo real es: SSR en /kanban -> screen cliente con @dnd-kit -> PUT /api/kanban -> readJson(...,
  kanbanBoardActionSchema) -> mutateKanbanBoard() en src/server/services/kanban.ts -> transacción Prisma sobre
  kanban_columns, kanban_project_placements y, en el estado actual del repo, también projects.status.

  Diagnóstico inicial: en el repo actual, el contrato cliente-servidor de /api/kanban está alineado y el
  endpoint siempre responde JSON vía withRoute(). Por eso, el mensaje cliente "La operación falló." solo
  aparece si la respuesta llega !ok y sin body JSON utilizable. Además, el error cliente Unexpected end of
  JSON input no puede salir hoy del apiFetch del kanban; en este repo ese string solo puede surgir server-side
  en request.json() con body vacío/malformado, o de un deploy anterior/distinto al código actual.

  ## Archivos involucrados

  | Path | Rol | Fragmento relevante |
  | --- | --- | --- |
  | src/app/kanban/page.tsx:1 | Page SSR del feature. Carga board inicial. | const board = await
  getKanbanBoard(); return <KanbanScreen board={board} />; |
  | src/components/screens/kanban-screen.tsx:357 | Screen cliente completa del kanban. Contiene DnD,
  optimistic update y llamadas API. | handleDragEnd -> moveCard -> persistBoard -> apiFetch("/api/kanban") |
  | src/components/screens/kanban-screen.tsx:175 | Componentes hijos locales. | SortableKanbanColumn,
  SortableProjectCard, ColumnCard viven en el mismo archivo. |
  | src/lib/api.ts:3 | Helper genérico de fetch cliente. | const rawBody = await response.text(); ... throw
  new Error(payload?.error ?? "La operación falló."); |
  | src/app/api/kanban/route.ts:1 | Route handler HTTP del kanban. | const input = await readJson(request,
  kanbanBoardActionSchema); return mutateKanbanBoard(input); |
  | src/server/http.ts:1 | Wrapper común de request/response y parseo JSON. | await request.json() y return
  Response.json({ data }) / return Response.json({ error }) |
  | src/server/services/kanban.ts:39 | Lógica server real del kanban. Valida acciones, arma board y ejecuta
  Prisma. | kanbanBoardActionSchema, reorderBoardInDatabase(), mutateKanbanBoard() |
  | src/server/services/finance.ts:198 | No es entrypoint del kanban, pero aporta reglas de negocio invocadas
  por kanban.ts. | syncProjectMaintenanceSchedule() y reglas de ACTIVE/COMPLETED/CANCELLED |
  | src/lib/types.ts:29 | Tipos compartidos del board y envelope API. | KanbanBoardPayload, KanbanProjectCard,
  ApiEnvelope<T> |
  | prisma/schema.prisma:10 | Modelo relacional real. | enum ProjectStatus, model Project, KanbanColumn,
  KanbanProjectPlacement |
  | src/middleware.ts:8 | Puede afectar APIs si no hay cookie de sesión. | Redirige a /login cuando falta
  broco_session |

  Hooks/librerías de DnD:

  - Librería: @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities.
  - Hooks DnD: useSensors, useSensor, useSortable.
  - Eventos DnD usados: DragStartEvent, DragEndEvent.
  - Helpers de estado cliente: normalizeBoardColumns, serializeBoard, moveCard, findCardLocation,
    persistBoard.

  ## Flujo actual del kanban

  1. La ruta src/app/kanban/page.tsx:6 ejecuta getKanbanBoard() y renderiza KanbanScreen.
  2. En src/components/screens/kanban-screen.tsx:379, DnD se configura con PointerSensor, TouchSensor y
     DndContext.
  3. Al empezar un drag, handleDragStart() guarda activeDragItem según event.active.data.current.type.
  4. Al soltar, handleDragEnd() en src/components/screens/kanban-screen.tsx:471 distingue si se movió una
     columna o una card.
  5. Si es card:
      - calcula sourceColumnId, overColumnId, targetIndex;
      - usa moveCard() para hacer optimistic update local;
      - construye nextBoard;
      - llama persistBoard(nextBoard, boardState).
  6. persistBoard() en src/components/screens/kanban-screen.tsx:439 serializa el board así:
      - action: "reorder_board"
      - orderedColumnIds: string[]
      - columns: Array<{ columnId: string; projectIds: string[] }>
  7. El cliente hace fetch vía apiFetch("/api/kanban", { method: "PUT", body: JSON.stringify(...) }).
  8. El endpoint src/app/api/kanban/route.ts:8 ejecuta:
      - readJson(request, kanbanBoardActionSchema)
      - mutateKanbanBoard(input)
  9. readJson() en src/server/http.ts:4 hace await request.json() y valida con Zod.
  10. mutateKanbanBoard() en src/server/services/kanban.ts:831 entra al switch por action.
  11. Para un drag/drop entra en reorderBoardInDatabase():

  - valida columnas activas e integridad del payload;
  - abre prisma.$transaction(...);
  - actualiza kanban_columns.position;
  - hace upsert de kanban_project_placements;
  - en el repo actual, si la card cambió de columna visible, deriva ProjectStatus y hace
    tx.project.update({ data: { status }});
  - después llama syncProjectMaintenanceSchedule() importado desde finance.ts.

  12. mutateKanbanBoard() hace revalidateTag("dashboard") y devuelve fetchKanbanBoardFromDatabase().
  13. withRoute() envuelve la salida en { data: ... }.
  14. apiFetch() devuelve payload.data y persistBoard() hace setBoardState(updatedBoard).
  15. Si falla, persistBoard() revierte al previousBoard y muestra screenError.

  ## Contrato cliente-servidor

  Request real del drag/drop:

  {
    "action": "reorder_board",
    "orderedColumnIds": ["<uuid-col-1>", "<uuid-col-2>"],
    "columns": [
      { "columnId": "<uuid-col-1>", "projectIds": ["<uuid-proj-a>", "<uuid-proj-b>"] },
      { "columnId": "<uuid-col-2>", "projectIds": [] }
    ]
  }

  Schema Zod real:

  const kanbanBoardActionSchema = z.discriminatedUnion("action", [
    z.object({
      action: z.literal("create_column"),
      name: z.string().trim().min(2, "El nombre es obligatorio."),
      color: kanbanColorSchema.nullable().optional(),
      isActive: z.boolean().optional(),
      isInitial: z.boolean().optional(),
    }),
    z.object({
      action: z.literal("update_column"),
      columnId: z.string().uuid("Columna inválida."),
    }).merge(kanbanColumnInputSchema),
    z.object({
      action: z.literal("delete_column"),
      columnId: z.string().uuid("Columna inválida."),
      targetColumnId: z.string().uuid("Columna destino inválida.").nullable().optional(),
    }),
    z.object({
      action: z.literal("reorder_board"),
      orderedColumnIds: z.array(z.string().uuid("Columna inválida.")).min(1),
      columns: z.array(
        z.object({
          columnId: z.string().uuid("Columna inválida."),
          projectIds: z.array(z.string().uuid("Proyecto inválido.")),
        }),
      ),
    }),
  ]);

  Success response real:

  {
    "data": {
      "columns": [/* KanbanBoardColumn[] */],
      "clients": [{ "id": "...", "name": "..." }],
      "demoMode": false,
      "persistenceAvailable": true,
      "notice": null
    }
  }

  Failure response real:

  { "error": "mensaje legible" }

  Alineación cliente ↔ server:

  - Sí, en el repo actual están alineados para /api/kanban.
  - El cliente espera JSON envelope {data} en success y {error} en failure.
  - El server actual de /api/kanban siempre intenta responder JSON por withRoute().
  - El cliente no verifica content-type; si el body no vacío no es JSON, cae en "La API devolvió una respuesta
    inválida." o "La API devolvió un error inválido.".
  - El cliente no hace response.json() directo; hace response.text() y JSON.parse(...) si hay body.

  ## Manejo actual de errores

  Dónde aparece "La operación falló.":

  - En src/lib/api.ts:23.
  - Se dispara solo si response.ok === false y payload?.error es falsy.
  - Eso implica: status de error + body vacío o no parseado como JSON nulo.

  Catch genéricos relevantes:

  - Cliente kanban: src/components/screens/kanban-screen.tsx:448
  - Wrapper server: src/server/http.ts:15
  - Servicio kanban: src/server/services/kanban.ts:851

  Unexpected end of JSON input hoy:

  - No hay ningún response.json() vulnerable en el flujo cliente del kanban.
  - Sí hay un await request.json() en src/server/http.ts:5. Si el body del request llega vacío o truncado, eso
    puede lanzar exactamente ese SyntaxError.
  - Como withRoute() lo atrapa y usa getErrorMessage(error), el server podría devolver { "error": "Unexpected
    end of JSON input" }.

  Verificación de cuerpos vacíos / 204 / Response(null):

  - No encontré ningún 204, new Response(null, ...) ni branch vacío en src/app/api/** o src/server/**.
  - /api/kanban actual no tiene rutas que devuelvan body vacío.
  - Por código, el kanban actual no debería producir empty body desde la app; si ocurre, sería por runtime
    externo, middleware/proxy, deploy distinto o crash antes de que withRoute() termine.

  Fragilidad actual:

  - apiFetch() no verifica content-type.
  - readJson() no convierte request.json() malformado a AppError 4xx; hoy quedaría como 500 con el mensaje
    nativo.
  - El middleware puede redirigir APIs a /login si falta sesión; eso rompería el contrato JSON, aunque el
    mensaje esperable sería “respuesta inválida”, no “La operación falló.”.

  ## Estados y compatibilidad con Prisma

  El enum real de Prisma es:

  - ProjectStatus = ACTIVE | COMPLETED | CANCELLED en prisma/schema.prisma:10

  El kanban visual no representa exactamente ese enum:

  - Hay 10 columnas visuales.
  - Solo hay 3 statuses reales persistidos.
  - El request del cliente no envía status; envía columnId.
  - El mapping visual -> status real se hace server-side en resolveProjectStatusForColumn().

  | Columna Kanban | Valor enviado al server | Valor esperado por Prisma | ¿Compatible? | Observaciones |
  | --- | --- | --- | --- | --- |
  | Prospeccion / Contactos | columnId UUID, no status | ACTIVE | Sí | isInitial=true fuerza ACTIVE. |
  | Presupuesto enviado / Esperando respuesta | columnId UUID | ACTIVE | Sí | Queda en bucket abierto. |
  | Aprobado / Pendiente de inicio | columnId UUID | ACTIVE | Sí | Queda en bucket abierto. |
  | En curso | columnId UUID | ACTIVE | Sí | Queda en bucket abierto. |
  | Bloqueado / En espera | columnId UUID | ACTIVE | Sí | Queda en bucket abierto. |
  | En revision / Cierre | columnId UUID | ACTIVE | Sí | resolveProjectStatusForColumn() no matchea "cierre",
  solo "cerrado". |
  | Completado | columnId UUID | COMPLETED | Sí | Match exacto por nombre. |
  | Recurrente mensual | columnId UUID | ACTIVE | Sí | No cierra el proyecto. |
  | No aprobado / Sin respuesta | columnId UUID | CANCELLED | Sí | Match por "no aprobado" / "sin respuesta".
  |
  | Finalizado | columnId UUID | COMPLETED | Sí | Match exacto por nombre. |

  Observaciones críticas:

  - No existe mapping exacto status real -> columna visual.
  - buildCards() en src/server/services/kanban.ts:358 ubica la card por KanbanProjectPlacement; si no hay
    placement activo, la manda a la columna inicial, sin importar Project.status.
  - Entonces el kanban usa placements visuales persistidos y el status real solo se muestra como badge / regla
    de negocio secundaria.

  Restricciones de negocio ligadas al status real:

  - En src/server/services/finance.ts:198, ACTIVE vs COMPLETED/CANCELLED gobierna lógica de mantenimiento.
  - En src/server/services/finance.ts:701, proyectos cerrados no admiten nuevos Income PENDING.

  ## Hipótesis ordenadas por probabilidad

  1. La respuesta que recibe el cliente al hacer PUT /api/kanban está llegando fuera del contrato JSON
     esperado.
     Evidencia: hoy /api/kanban siempre usa withRoute() y debería devolver JSON. El mensaje "La operación
     falló." solo aparece si !response.ok y no hay payload.error usable en src/lib/api.ts:23.
  2. El deploy/runtime que generó Unexpected end of JSON input no coincide exactamente con el cliente actual
     del repo.
     Evidencia: en el repo actual el cliente del kanban ya no llama response.json(); usa response.text() +
     JSON.parse. Ese error exacto no sale hoy del path cliente del kanban.
  3. Hay una excepción server-side real dentro de reorderBoardInDatabase() o del update de Project.status,
     pero el cliente no la ve completa porque la respuesta final no llega como JSON.
     Evidencia: la mutación toca varias validaciones y varias tablas en una transacción: kanban_columns,
     kanban_project_placements, projects y luego syncProjectMaintenanceSchedule().
  4. El body del PUT /api/kanban llega vacío o malformado en algún escenario y request.json() lanza Unexpected
     end of JSON input.
     Evidencia: readJson() hace await request.json() sin guard adicional. Eso sí puede producir ese mensaje
     exacto hoy, pero no encaja bien con el cliente actual que siempre serializa body.
  5. Hay un problema de sesión/cookie y middleware devuelve redirect/HTML en vez de JSON.
     Evidencia: src/middleware.ts:17 redirige a /login cuando falta broco_session. Esto rompe el contrato API,
     aunque en el cliente actual lo esperable sería “La API devolvió un error inválido.” más que “La operación
     falló.”.
  6. Una validación Zod o de integridad del board está rechazando el reorder.
     Evidencia: kanbanBoardActionSchema exige UUIDs; reorderBoardInDatabase() además valida estructura,
     columnas activas, duplicados y concurrencia. Esto daría errores específicos 409/422, no genéricos, salvo
     que la respuesta se pierda.

  ## Evidencia de código

  src/components/screens/kanban-screen.tsx:439

  const persistBoard = (nextBoard, previousBoard) => {
    startTransition(async () => {
      try {
        setScreenError(null);
        const updatedBoard = await apiFetch("/api/kanban", {
          method: "PUT",
          body: JSON.stringify(serializeBoard(nextBoard.columns)),
        });
        setBoardState(updatedBoard);
      } catch (error) {
        setBoardState(previousBoard);
        setScreenError(error instanceof Error ? error.message : "No se pudo persistir el tablero.");
      }
    });
  };

  src/lib/api.ts:12

  const rawBody = await response.text();
  let payload = null;

  if (rawBody) {
    payload = JSON.parse(rawBody);
  }

  if (!response.ok) {
    throw new Error(payload?.error ?? "La operación falló.");
  }

  src/app/api/kanban/route.ts:8

  export async function PUT(request: Request) {
    return withRoute(async () => {
      const input = await readJson(request, kanbanBoardActionSchema);
      return mutateKanbanBoard(input);
    });
  }

  src/server/http.ts:4

  export async function readJson<T>(request: Request, schema: ZodSchema<T>) {
    const payload = await request.json();
    const result = schema.safeParse(payload);
    if (!result.success) {
      throw new AppError(result.error.issues[0]?.message ?? "Payload inválido", 422);
    }
    return result.data;
  }

  src/server/services/kanban.ts:115

  function resolveProjectStatusForColumn(column: { name: string; isInitial: boolean }) {
    if (column.isInitial) return ProjectStatus.ACTIVE;
    if (normalizedName.includes("no aprobado") || normalizedName.includes("sin respuesta")) {
      return ProjectStatus.CANCELLED;
    }
    if (normalizedName === "completado" || normalizedName === "finalizado") {
      return ProjectStatus.COMPLETED;
    }
    return ProjectStatus.ACTIVE;
  }

  src/server/services/kanban.ts:563

  await Promise.all(
    input.columns.flatMap((column) =>
      column.projectIds.map((projectId, index) =>
        tx.kanbanProjectPlacement.upsert({
          where: { projectId },
          update: { kanbanColumnId: column.columnId, position: index },
          create: { projectId, kanbanColumnId: column.columnId, position: index },
        }),
      ),
    ),
  );

  src/server/services/kanban.ts:385

  const canUseExplicitPlacement =
    Boolean(placement) &&
    columnIds.has(placement!.kanbanColumnId) &&
    activeColumnIds.has(placement!.kanbanColumnId);

  const displayColumnId = canUseExplicitPlacement ? placement!.kanbanColumnId : initialColumn.id;

  ## Qué información adicional ya NO necesito pedirte

  - Dónde vive la pantalla Kanban.
  - Qué librería de drag & drop usa.
  - Qué función maneja el drop.
  - Qué endpoint llama la UI.
  - Qué schema Zod valida el body.
  - Qué función server muta Prisma.
  - Qué modelos y enums de Prisma participan.
  - Qué shape exacto tiene el request del drag.
  - Qué shape exacto tiene la respuesta success/failure.
  - Dónde nace el mensaje "La operación falló.".
  - Si hoy existe algún 204 o body vacío en la app code para /api/kanban.
  - Cómo mapea el kanban visual a ProjectStatus.
  - Qué reglas de negocio dependen de Project.status.

  Dato que todavía puede faltar para certeza absoluta sobre producción:

  - El body/headers/status reales del PUT /api/kanban fallido en Network o el log exacto de Vercel de ese
    request. Para la auditoría del repo no hace falta más código.

  ## Recomendación de fix

  Todavía no tocaría DnD ni el modelo Prisma.

  Fix ideal de menor impacto:

  1. Tocar src/lib/api.ts:3.
     Por qué: ahí se decide si el usuario ve "La operación falló.", "respuesta inválida" o el mensaje real. Es
     el punto más barato para distinguir body vacío, HTML, redirect y JSON inválido.
     Riesgo: bajo.
     Validación: reproducir PUT /api/kanban con response OK, 4xx JSON, 5xx HTML y body vacío.
  2. Tocar src/server/http.ts:4.
     Por qué: request.json() hoy puede filtrar Unexpected end of JSON input como 500 nativo. Conviene
     convertir eso en AppError 400/422 explícito si el body viene vacío o truncado.
     Riesgo: bajo.
     Validación: enviar PUT /api/kanban con body vacío y confirmar respuesta JSON controlada.
  3. Solo si después de eso el error real apunta a la mutación, tocar src/server/services/kanban.ts:474.
     Por qué: ahí están las validaciones, el upsert de placements y el update de Project.status.
     Riesgo: medio, porque afecta board placements, projects.status y sincronización de mantenimiento.
     Validación: drag entre columnas activas, drag hacia Completado, drag hacia No aprobado / Sin respuesta,
     reorder de columnas y delete de columna con reasignación.
  4. Revisar producción antes de cambiar negocio.
     Por qué: el síntoma "Unexpected end of JSON input" no calza con el cliente actual del repo. Puede haber
     drift entre repo y deploy.
     Riesgo: bajo.
     Validación: comparar commit desplegado en Vercel con este workspace y mirar logs [kanban.mutate] /
     [api.route].

  ## Cómo reproducir y validar

  - Ruta: /kanban
  - Prerrequisitos:
      - sesión válida (broco_session);
      - DATABASE_URL configurada;
      - migración 20260317160000_add_kanban_tables aplicada;
      - al menos un Project y dos columnas activas;
      - no estar en demo mode ni en readonly mode;
      - no tener filtros activos, porque dragDisabled bloquea el DnD.
  - Caso sugerido 1: mover una card desde la columna inicial a otra columna activa abierta, para aislar el
    flujo sin cerrar el proyecto.
  - Caso sugerido 2: mover una card a Completado o No aprobado / Sin respuesta, para ejercitar también el
    mapping a Project.status.
  - Request esperado en Network:
      - PUT /api/kanban
      - Content-Type: application/json
      - body con action: "reorder_board", orderedColumnIds y columns[].
  - Logs útiles:
      - Cliente: payload de serializeBoard(nextBoard.columns) y response.status,
        response.headers.get("content-type"), rawBody.length.
      - Server: entrada de readJson, salida de kanbanBoardActionSchema.safeParse, y el contexto
        [kanban.mutate].
      - Vercel: buscar PUT /api/kanban, [kanban.mutate], [api.route], PrismaClientKnownRequestError,
        PrismaClientInitializationError, SyntaxError: Unexpected end of JSON input.
