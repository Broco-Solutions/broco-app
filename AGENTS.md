# AGENTS.md

Next.js 14 (App Router) + Prisma 6 + PostgreSQL + Tailwind. pnpm. Tests: Vitest (unit/integration) + Playwright (E2E). Finance app: Clientes → Proyectos → Ingresos/Gastos, dashboard con KPIs.

## Comandos

- `pnpm dev` — dev server (primer puerto libre: 3000, 3001, ...)
- `pnpm build && PORT=3299 npx next start -p 3299` — server para E2E (los specs hardcodean `BASE = "http://localhost:3299"`)
- `pnpm test` — Vitest (carga `.env.test` via `tests/setup-env.ts`; alias `@`, mocks `server-only`, `next/cache`, `next/headers`)
- `pnpm lint` / `pnpm exec tsc --noEmit` / `pnpm build`
- `npx playwright test tests/e2e/ --workers=1` — E2E (workers>1 satura el server)

Package manager canónico: **pnpm**. `package-lock.json` está deliberadamente eliminado del repo; NO usar `npm install`/`npm ci` (regenerarían el lockfile de npm).

## Base de datos de test

- `docker compose -f docker-compose.test.yml up -d` → Postgres en `localhost:5434` (user `broco_test`, db `broco_finance_test`)
- `.env.test` define `DATABASE_URL` y `DATABASE_URL_TEST` (ambas → DB test). `.env*` están en gitignore; si no existe `.env`, las server actions/client Prisma fallan al conectar.
- **Orden para integración:** DB up → `DATABASE_URL=<test> npx prisma db push` → seed. El seed exige `DATABASE_URL ≠ DATABASE_URL_TEST` (usar `DATABASE_URL=postgresql://mock:mock@localhost:9999/broco_finance_prod`). `pnpm db:seed:test` ya lo hace.
- `reconciliation.test.ts` espera totales exactos del seed canónico (24024.94/16181.03).
- **Fallas de integración pre-existentes (NO arreglar en app code):** `tests/sql/constraints.test.ts` (CHECKs SQL que no existen en la DB), tests de duplicados case-insensitive, reconciliación. Correr `tests/integration/incomes.test.ts` + `thirty-days` + `date-filters` + `dashboard-kpis` para validar cambios de ingresos.

## Arquitectura

- Pages = Server Components con `export const dynamic = "force-dynamic"`. Lists = Client Components (`"use client"`) que reciben props serializadas con `JSON.parse(JSON.stringify(...))`.
- Server Actions: `(prev, formData) => Promise<{ success: true } | { success: false; message: string }>`. **Siempre** chequear `result.success` en el cliente y lanzar el error (el modal lo muestra).
- `revalidatePath` en acciones debe cubrir **todas** las rutas afectadas (ej. saveClient → `/clients`, `/projects`, `/clients/[id]`; saveProject → `/projects`, `/clients/[id]`, `/incomes`, `/expenses`).
- Tras mutaciones, las listas llaman `router.refresh()` y se sincronizan con `useEffect(() => setX(initialX), [initialX])`. No usar `window.location.reload()`.

## Modelo de ingresos (migrado de enum → modelo dinámico)

- `Income.typeId` FK → tabla `income_types` (name, `requiresProject`, isActive). Seed: Desarrollo (true), Mantenimiento (true), Otro (false).
- La validación "requiere proyecto" usa `IncomeType.requiresProject`, NO nombres hardcodeados.
- Filtro/tabla/bulk usan `typeId` y muestran `income.type?.name`. Botón "Tipos" gestiona el CRUD (replica categorías de gastos).

## Dinero y fechas

- Montos son `Decimal(18,6)`. `computeMoney` (services incomes/expenses): ARS+exchangeRate → USD con `dividedBy(fx).toFixed(6)`; USD directo **sin** `Math.round` (rompe decimales).
- Constraint DB `chk_income_monetary_consistency`: `amountUsd ≈ amountArs/exchangeRate`. En bulk: si cambias `amountUsd` limpia ARS/TC; si cambias ARS debés mandar también `exchangeRate`.
- `formatDate` hace `value.slice(0,10)+"T00:00:00"` para strings ISO (timezone-safe). Columnas `@db.Date` se comparan con `new Date(Date.UTC(y,m,d))` (medianoche UTC).
- Bulk edit: `bulkUpdateIncomes/Expenses` usan `updateMany`.

## UI / tests E2E

- `DataTable`: `table-fixed` + colGroup %, `w-full` (sin `min-w-max`). Los `colGroup` suman 100%.
- `SearchableSelect` es un combobox custom (button + dropdown + input), NO un `<select>` nativo. Playwright: click en button → option en el dropdown.
- Índices de `<select>` nativos en tests dependen del layout de filtros: status y type son nativos; Cliente/Proyecto son SearchableSelect.
- E2E usan login real de Auth.js con cuentas locales de prueba; no usar cookies compartidas.
- Ingresos y Gastos soportan "Agregar varios" (batch rows) con estado `multi`, `count`, `interval`, `rows`.

## Portal público del cliente (/p)

- `/p/[slug]` es público y read-only; usa `resolveShareGateBySlug` + `authorizeClientAccess` (cookie `portal_session` por proyecto, `path: /p/<slug>`, HMAC + expiración) + `getAuthorizedProjectPlan(slug, session)` (whitelist, sin datos financieros ni tareas `clientVisible=false`).
- Requiere `PROJECT_SHARE_ENCRYPTION_KEY` y `PROJECT_SHARE_SESSION_SECRET` (ambos 64 hex, distintos; `openssl rand -hex 32`).
- **Gotcha de seguridad:** para matchear solo el portal NO usar `pathname.startsWith("/p")` — matchea también `/projects` (los haría públicos/sin sidebar). Usar `pathname === "/p" || pathname.startsWith("/p/")` en `middleware.ts` y `AppShell`.
- **Project Planning (DHTMLX Gantt Community 10.0.2, único motor):** `ProjectPhase`→DHTMLX `project`, `TASK`→`task`, `MILESTONE`→`milestone`, Go Live como milestone de referencia; interno editable (drag/resize intra-fase, `onAfterTaskDrag` debe usar `gantt.getTask(id)`), portal `readonly`; `row_height 40/bar_height 22`; grid y timeline sincronizados; CSS oficial `dhtmlx-gantt/codebase/dhtmlxgantt.css` importado antes de `project-gantt.css`; sin `table-fixed` hacks.

## Producción

- URL = Prisma Accelerate (`db.prisma.io`). `psql` NO conecta. Usar `$executeRawUnsafe` con **una sentencia por call** (multi-sentencia falla con "cannot insert multiple commands into a prepared statement").
- **Cambios de esquema:** NO usar `prisma migrate dev` ni `prisma migrate deploy` para features (sin `directUrl`, el proxy de Accelerate no ejecuta DDL). En local/test se usa `prisma db push`; en producción, scripts controlados con `$executeRawUnsafe` (una sentencia por call) y pre-checks de seguridad.
- `scripts/migrate-income-types.sql` (para psql) y `scripts/migrate-production.ts` (runner Prisma) ejecutan la migración de income_types; pre-checks de seguridad (aborta si ya existe o si quedan NULLs).
 - `scripts/migrate-project-share-v1-1.ts` migra share a slug/password/accessVersion; es idempotente (legacy con filas → ABORT, ya migrado → SKIP). **Cleanup V1.1 completado en producción:** `token_hash` e índice legacy eliminados (`--cleanup` dio CLEANUP_COMPLETED y segunda ejecución SKIP); schema final sin `token_hash`.
 - **Deploy V1.1:** 1) configurar `PROJECT_SHARE_*` en Vercel Production, 2) ejecutar migración, 3) segunda ejecución debe dar SKIP, 4) push `main` → Vercel auto-deploy.
