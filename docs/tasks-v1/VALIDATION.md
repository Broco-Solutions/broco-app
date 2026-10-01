# Tareas Operativas V1 — validación

Este documento se actualizará con cada lote.

## Estado inicial

- Rama base: `main` en `00f2354`.
- Working tree inicial: limpio.
- Rama de trabajo: `feat/operational-tasks-v1`.
- No se ejecutaron migraciones contra producción.

## Lote 1

- `pnpm prisma:generate`: pasó.
- `DATABASE_URL=<test> pnpm exec prisma db push`: pasó contra PostgreSQL local de test.
- `pnpm db:test:constraints`: pasó; 49 sentencias verificadas/aplicadas.
- `pnpm exec vitest run tests/integration/operational-tasks.test.ts tests/integration/production-operational-tasks-runner.test.ts`: 2 archivos, 9 tests, todo pasó.
- `pnpm exec tsc --noEmit`: pasó.
- `git diff --check`: pasó.

Nota: `pnpm test:db:up` informó conflicto porque el contenedor canónico ya estaba iniciado; se verificó que `broco_finance_test_db` estaba `healthy` en el puerto 5434 y se continuó con esa instancia.

## Lote 2

- `pnpm exec tsc --noEmit`: pasó.
- `pnpm exec vitest run tests/unit/operational-task-order.test.ts tests/integration/operational-tasks.test.ts`: 2 archivos, 8 tests, todo pasó.
- Regresión de orden financiero: pasó junto con la primera verificación de UI compartida.

## Lote 3

- `pnpm exec tsc --noEmit`: pasó.
- `pnpm exec vitest run tests/integration/operational-tasks.test.ts tests/unit/operational-task-order.test.ts`: 2 archivos, 8 tests, todo pasó.
- `git diff --check`: pasó.
- Verificado por test de integración: bloqueo sin motivo rechazado, motivo preservado al reanudar, `completedAt` al completar, limpieza al reabrir y rechazo de edición obsoleta.

## Lote 4

- Prisma Client regenerado y schema aplicado únicamente sobre PostgreSQL local de test mediante `prisma db push`.
- Seed financiero canónico, constraints y fixture de Horas restaurados en la base local. El fixture reutilizó `APP_PASSWORD` de `.env.test` como `HOURS_TEST_PASSWORD`; no se creó ni imprimió una credencial nueva.
- `pnpm exec tsc --noEmit`: pasó.
- Suites focalizadas de Tareas, Horas y runners productivos: 6 archivos, 29 tests, todo pasó.
- Verificado: descripción automática, detalle adicional, vínculo real con `TimeEntry`, IDOR, tarea sin proyecto, carga ADMIN para responsable, idempotencia, auditoría y exclusión de anulados del total.

## Lote 5

- Se revisó la autenticación MCP real: Auth0 OAuth valida issuer, audience, allowlist y scopes, pero no resuelve un `AppUser` activo ni su rol/asignaciones.
- Las tools operativas no fueron registradas para evitar que una identidad MCP pueda eludir el scope ADMIN/COLLABORATOR.
- La decisión necesaria quedó registrada en `DECISIONS_PENDING.md`.

## Lote 6

- `pnpm test`: 49 archivos, 462 tests, todo pasó.
- `pnpm lint`: pasó sin warnings.
- `pnpm exec tsc --noEmit`: pasó.
- `pnpm build`: pasó; `/tasks` quedó incluida como ruta dinámica.
- `git diff --check`: pasó.
- `tests/e2e/operational-tasks.spec.ts`: 2 casos, todo pasó en build de producción local. Cubre ADMIN y COLLABORATOR, asignación, restricción por `HourAssignment`, bloqueo, vencida calculada sin reemplazar estado, tiempo real, finalización con acumulado, reapertura, navegación financiera y viewport móvil sin overflow.
- Suite E2E global: 30 casos, todo pasó con 6 workers.
- Se actualizaron cinco pruebas preexistentes sin cambiar comportamiento sano: `hours-auth` ahora exporta la fecha realmente cargada; `income-modal` y `smoke` localizan selects dentro del modal en vez de usar índices globales; `shared-folder` obtiene el enlace desde el elemento `<a>`, la contraseña desde `<code>` y la revela si un refresh concurrente vuelve a ocultarla.
- Se verificó con test de integración que dos proyectos llamados `Proyecto igual`, pertenecientes a clientes distintos, permanecen inequívocos por la relación `project.client`; la UI siempre presenta `Cliente · Proyecto`.
- El servidor se levantó contra la base local de test. Para Auth.js se reutilizó `SESSION_SECRET` como `AUTH_SECRET` en el proceso local; no se creó ni imprimió ningún secreto.
- Verificación visual autenticada con navegador real: ADMIN y COLLABORATOR cargaron sin overlay ni overflow horizontal; la tabla truncó títulos largos, el detalle mostró la descripción completa y el formulario de tiempo sólo pidió fecha, horas, minutos y detalle opcional.
- Se corrigió el grid de filtros ADMIN para que use dos filas a 1280 px y una fila sólo con ancho suficiente.
- Se corrigió la finalización para conservar abierto el detalle, mostrar la confirmación, el tiempo acumulado y la invitación opcional a registrar otro tiempo. Los cambios de estado actualizan la lista local con el `updatedAt` devuelto por el servidor y mantienen CAS.
- Verificado de punta a punta: el registro desde la tarea apareció como `TimeEntry` en Tiempos → Registros, permitió la corrección administrativa existente y fue incluido en Reportes. La descripción usó título más detalle opcional, sin copiar la descripción larga.
- No se ejecutaron DDL ni migraciones contra producción, ni se hizo deploy.
