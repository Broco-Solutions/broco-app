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
