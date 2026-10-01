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

## Ajuste final — consistencia de carga de tiempo

- Se compartieron entre Tiempos y Tareas los campos de Fecha y Duración/Unidad, y el mismo conversor servidor de minutos/horas. La carga rápida conserva el selector Minutos/Horas, coma decimal, equivalencia visible, rechazo de fracciones de minuto o redondeos y límite de 24 horas.
- La Fecha abre precargada con el día actual de Argentina, continúa editable y mantiene el mismo máximo y validación de calendario de Tiempos.
- `tests/unit/time-duration.test.ts` y las integraciones de Tareas/Tiempos: 3 archivos, 24 tests, todo pasó.
- `pnpm test`: 50 archivos, 468 tests, todo pasó.
- `tests/e2e/operational-tasks.spec.ts`: 2 casos, todo pasó. El flujo valida fecha inicial, unidad, equivalencia, creación real, acumulado de la tarea y aparición en Tiempos → Registros.
- Suite E2E global: 30 casos, todo pasó con 6 workers.
- `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` y `git diff --check`: todo pasó.
- Verificación de navegador sobre el build local: login renderizó contenido e interacciones, sin overlay de error. Se usaron únicamente la base y las credenciales locales de test existentes.
- No se ejecutaron DDL ni migraciones contra producción, ni se hizo push, merge o deploy.

## Ajuste UX definitivo — Horas + Minutos

- El patrón anterior `Duración + Unidad` fue reemplazado en todos los formularios humanos: creación normal, carga rápida desde tarea y corrección de registros. No tenía consumidores externos; servicios, exportación, reportes y base ya operaban con minutos totales.
- Los campos compartidos aceptan vacío como cero y restringen enteros: Horas 0–24, Minutos 0–59 y total 1–1440. La misma conversión se valida nuevamente en servidor.
- La edición convierte los minutos persistidos con `floor(total / 60)` y `total % 60`; auditoría, anulación lógica y CAS permanecen sin cambios.
- Suite focalizada de Tareas/Tiempos y duración: 3 archivos, 28 tests, todo pasó.
- `pnpm test`: 50 archivos, 472 tests, todo pasó.
- `tests/e2e/operational-tasks.spec.ts`: 2 casos, todo pasó. Cubre fecha de hoy, campos vacíos, teclado, responsive, persistencia real, acumulado y corrección ADMIN 25 min → 1 h 35 min.
- Suite E2E global: 30 casos, todo pasó con 6 workers. Incluye creación normal sólo con minutos y con horas + minutos.
- `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` y `git diff --check`: todo pasó.
- La revisión en navegador sobre el build local no mostró overlay de error ni overflow horizontal en 375 px.
- No se requiere DDL adicional: `TimeEntry.minutes` sigue siendo la única representación persistida.

## Gate de integración y producción

- `git fetch origin` confirmó `main` y `origin/main` alineados en `00f2354`; la feature es un avance lineal de nueve commits, sin divergencias.
- Publicación productiva iniciada el 2026-10-01. Se generó el backup lógico PRE `/home/rcoirini/backups/broco/broco-pre-operational-tasks-20261001-183039.dump` (96.934 bytes, SHA-256 `6f890b09a95454575896d897cbfceaa3e9f5623f753cdd4725c3a874034c0319`). Se verificó con `pg_restore --list` usando PostgreSQL 17 y su checksum fue validado.
- El inventario PRE quedó en `/home/rcoirini/backups/broco/broco-pre-operational-tasks-20261001-183039.inventory.json` (SHA-256 `6cb10a386501accc7a73e413db8a3a31cf6687d308b04545774e0c33f6465de5`).
- `prod:migrate:operational-tasks`: primera ejecución `MIGRATION_COMPLETED`; segunda ejecución `MIGRATION_SKIPPED`.
- `prod:migrate:operational-task-time`: primera ejecución `MIGRATION_COMPLETED`; segunda ejecución `MIGRATION_SKIPPED`.
- El inventario POST quedó en `/home/rcoirini/backups/broco/broco-post-operational-tasks-20261001-183039.inventory.json` (SHA-256 `a7672721f9cd717c528596b1fa1bf3ac465a20cbfdb2fc676fd0cf80ef379035`). `prod:inventory:compare` confirmó `INVENTORY_MATCH`: se preservaron los conteos y las huellas históricas.
- Los runners validaron sus postcondiciones: `OperationalTask`, su enum, relaciones e índices; y la FK/índice nullable de `TimeEntry.operationalTaskId`. No se requirió backup POST: el antecedente productivo versionado contempla el dump verificable PRE.

## Publicación productiva

- `main` se integró por fast-forward desde `00f23546c2af58102df9d4c2c64784952efd5af2` hasta `710048c7d23895cc620c8c331d4256f0fa2181b5` y se publicó en `origin/main`.
- La validación sobre `main` pasó: `pnpm test` (50 archivos, 472 tests), lint, typecheck, build y `git diff --check`.
- Vercel publicó el deployment de producción `dpl_GU4vNPwRNwJLZADqEc1ZYELuF4yG` para `710048c7d23895cc620c8c331d4256f0fa2181b5`, estado `READY`, URL `https://app.brocosolutions.com`.
- Smoke no autenticado: la pantalla de login productiva respondió correctamente. No se completó el smoke autenticado: la credencial local disponible no fue aceptada por la identidad productiva y no se intentaron credenciales alternativas ni se crearon datos de prueba.
