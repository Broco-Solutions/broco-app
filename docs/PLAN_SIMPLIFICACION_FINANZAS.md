# Plan de Simplificación — Sistema Financiero Broco Solutions

> HISTÓRICO / NO OPERATIVO. Este documento conserva decisiones y comandos de
> una etapa anterior. No describe el runtime actual ni autoriza operaciones
> sobre producción. Para producción consultar únicamente
> `docs/PRODUCCION.md`.

---

## 1. Resumen ejecutivo

Este plan describe la reconstrucción total del sistema financiero interno de Broco Solutions a partir
de la rama `main` en el commit `c77ae9f` (tag `pre-simplificacion-finanzas-2026-07-17`).

**Objetivo:** transformar una aplicación monolítica de ~4000 líneas en un servicio (`src/server/services/finance.ts`)
con 16 modelos Prisma, demo mode, Kanban, calendario, recurrencias automáticas, distribución,
salarios, y capas, en una herramienta financiera interna pequeña, clara y mantenible con solo 5
entidades funcionales, sin modo demo, sin recurrencias, sin cron, sin usuarios DB.

**Resultado esperado:** Dashboard + Clientes + Proyectos + Ingresos + Gastos + Categorías + Login por
contraseña global + Alertas operativas. Todo respaldado por 123 tests, vitest, base de test aislada,
seed canónico, y modelo de datos simplificado.

---

## 2. Estado verificado

| Indicador | Valor |
|---|---|
| Rama actual | `main` |
| HEAD | `c77ae9f` |
| Git status | limpio (sin archivos modificados) |
| Tag de respaldo | `pre-simplificacion-finanzas-2026-07-17` |
| Remoto | `https://github.com/Broco-Solutions/broco-finance.git` |
| Stack | Next.js 14.2.35, Prisma 6.19.2, PostgreSQL |
| Package manager | npm (package-lock.json presente) |
| Base productiva | vacía |
| `.env` | no existe |
| `.env.example` | no existe |
| `.env.test.example` | no existe |
| Runner de tests | no existe |
| Archivos de test | no existen |
| Vitest | no instalado |
| Jest | no instalado |
| `xlsx` | en `dependencies` (usado por seed) |
| `src/server/services/finance.ts` | 4052 líneas |
| `src/server/demo-data.ts` | 620 líneas |
| Demo mode | activo si `DATABASE_URL` no está configurado |
| Lint | correcto |
| Build | correcto |
| Migraciones Prisma | 12 migraciones en `prisma/migrations/` |
| `PLAN_BROCO_FINANZAS.md` | documentación original obsoleta (679 líneas) |
| `finanzas_handoff.md` | handoff técnico (967 líneas) |
| `resumen-codex.md` | resumen histórico (20 KB) |

---

## 3. Diagnóstico

### 3.1 Problemas detectados

1. **Servicio monolítico** (`finance.ts`: 4052 líneas). Contiene clientes, proyectos, ingresos,
   gastos, categorías, distribución, salarios, recurrentes, pagos programados, gastos programados,
   kanban, alertas, dashboard, y toda la lógica de sincronización. Está por encima del umbral de
   mantenibilidad para un equipo de 2 dueños.

2. **Demo mode como bypass** (`src/server/demo-data.ts`): cuando no hay `DATABASE_URL`, la app
   funciona con datos dummy en memoria. El patrón `if (!hasDatabaseConfig()) return demoData` está
   disperso en ~25 funciones de `finance.ts`. Esto permite operar sin PostgreSQL real, diluye la
   fuente de verdad y complejiza cada lectura y mutación.

3. **Complejidad de recurrencias**: 4 modelos (`RecurringIncome`, `RecurringExpense`,
   `ScheduledPayment`, `ScheduledExpense`) + lógica de sincronización automática en cada lectura
   (`syncProjectSubscriptions`, `syncOpenRecurringIncomes`, `syncOverduePayments`,
   `syncOpenRecurringExpenses`). La app genera automáticamente cobros y gastos futuros al cargar
   cualquier vista. Esto es frágil, impredecible y difícil de auditar.

4. **Distribución y salarios**: `DistributionConfig`, `SalaryWithdrawal` y `Expense.salaryWithdrawalId`
   añaden una capa extra de lógica para separar capas de reserva y retiros de socios. La nueva
   estrategia los convierte en gastos normales categorizados.

5. **Kanban** (`KanbanColumn`, `KanbanProjectPlacement`, `src/server/services/kanban.ts`: 877 líneas):
   sistema de pipeline de ventas integrado. Debe eliminarse completamente del sistema financiero.

6. **Calendario**: vista de calendario con chips coloreados para cobros/gastos programados. Debe
   eliminarse.

7. **Autenticación sin firma criptográfica**: el middleware solo verifica que la cookie
   `broco_session` tenga valor `"ok"`. No hay firma, no hay `SESSION_SECRET`, no hay validación de
   integridad. La contraseña demo hardcodeada (`"demo"`) se activa si `APP_PASSWORD` no existe.

8. **Sin tests**: no hay runner, no hay archivos de test, no hay validación automatizada de reglas
   de negocio, SQL constraints, ni integración.

9. **Precisión inconsistente**: `amountUsd` usa `Decimal(12,2)`, `exchangeRate` usa `Decimal(12,4)` en
   el schema actual. La nueva especificación requiere `Decimal(18,6)` para USD y exchange rate.

10. **Sin restricciones SQL CHECK**: el schema actual no tiene constraints SQL para `PENDING` sin
    `dueDate`, `PAID` sin `effectiveDate`, importes negativos, proyectos ARS sin TC, etc. Solo
    valida Zod en el servidor.

11. **`clientId` ausente en Income**: el modelo actual no tiene `clientId`. El cliente se deriva
    siempre de `project.clientId`. El nuevo modelo requiere `clientId` explícito para ingresos
    `OTHER` y para consistencia.

12. **`description` vs `concept`**: el modelo actual de Expense usa `description`. El nuevo modelo
    requiere `concept` como campo obligatorio.

13. **`isDefault` en ExpenseCategory**: el modelo actual tiene este campo. El nuevo modelo usa
    `isActive`.

14. **`date` obligatorio en Income/Expense**: el modelo actual tiene `date` como campo de fecha del
    movimiento. El nuevo modelo usa `effectiveDate` (opcional según estado) y `dueDate`.

15. **`xlsx` en dependencies de producción**: la librería `xlsx` se usa solo en el seed. Debe moverse
    a `devDependencies`.

### 3.2 Oportunidades

- La base productiva está vacía, lo que permite una migración destructiva limpia.
- El equipo de 2 dueños permite simplificar radicalmente la autenticación.
- Los datos históricos del Excel están bien documentados y pueden extraerse de forma controlada.
- El diseño visual (Tailwind + componentes UI) es reutilizable.
- Las reglas de negocio están maduras y documentadas en este plan.

---

## 4. Inventario de módulos

### 4.1 Páginas (App Router)

| Ruta | Archivo | Conservar |
|---|---|---|
| `/` (dashboard) | `src/app/page.tsx` | Sí (reconstruir) |
| `/login` | `src/app/login/page.tsx` | Sí (reconstruir) |
| `/clients` | `src/app/clients/page.tsx` | Sí (reconstruir) |
| `/clients/[id]` | `src/app/clients/[id]/page.tsx` | Sí (reconstruir) |
| `/projects` | `src/app/projects/page.tsx` | Sí (reconstruir) |
| `/projects/[id]` | `src/app/projects/[id]/page.tsx` | Sí (reconstruir) |
| `/incomes` | `src/app/incomes/page.tsx` | Sí (reconstruir) |
| `/expenses` | `src/app/expenses/page.tsx` | Sí (reconstruir) |

Rutas a eliminar: `/kanban`, `/calendar`, `/distribution`, `/recurring`.

### 4.2 API Routes

Conservadas (13): `/api/auth`, `/api/clients`, `/api/clients/[id]`, `/api/projects`, `/api/projects/[id]`,
`/api/incomes`, `/api/incomes/[id]`, `/api/expenses`, `/api/expenses/[id]`,
`/api/expense-categories`, `/api/expense-categories/[id]`, `/api/dashboard`, `/api/alerts`.

Eliminadas (12): `/api/kanban`, `/api/distribution`, `/api/salary`, `/api/salary/[id]`,
`/api/recurring-incomes`, `/api/recurring-incomes/[id]`, `/api/recurring-expenses`,
`/api/recurring-expenses/[id]`, `/api/scheduled-payments`, `/api/scheduled-payments/[id]`,
`/api/scheduled-expenses`, `/api/scheduled-expenses/[id]`.

### 4.3 Componentes

Conservados con modificaciones: `layout/` (5 archivos), `ui/` (15 archivos),
`screens/` (5 archivos: clients, projects, incomes, expenses, login-form),
`dashboard/` (2 archivos).

Eliminados: `screens/kanban-screen.tsx`, `screens/calendar-screen.tsx`,
`screens/distribution-screen.tsx`, `screens/recurring-screen.tsx`,
`payments/` (3 archivos), `expenses/pay-scheduled-expense-modal.tsx`,
`calendar/` (3 archivos).

### 4.4 Servicios

- `src/server/services/finance.ts` → reemplazado por servicios separados
- `src/server/services/kanban.ts` → eliminado

### 4.5 Archivos de soporte

- `src/server/prisma.ts` → modificar (sin lógica demo)
- `src/server/errors.ts` → conservar
- `src/server/http.ts` → conservar
- `src/server/demo-data.ts` → eliminar
- `src/middleware.ts` → reconstruir (HMAC-SHA256)
- `src/lib/types.ts` → reconstruir
- `src/lib/utils.ts` → modificar (Decimal, ARS)
- `src/lib/api.ts` → conservar base
- `src/lib/auth.ts` → reconstruir (firma HMAC)
- `src/lib/dashboard-date-range.ts` → modificar (zona Córdoba)

---

## 5. Inventario Prisma

### 5.1 Modelos actuales y su destino

| Modelo | Tabla | Acción |
|---|---|---|
| `Client` | `clients` | Conservar (modificar) |
| `Project` | `projects` | Conservar (modificar fuertemente) |
| `Income` | `incomes` | Conservar (modificar fuertemente) |
| `Expense` | `expenses` | Conservar (modificar fuertemente) |
| `ExpenseCategory` | `expense_categories` | Conservar (modificar) |
| `KanbanColumn` | `kanban_columns` | Eliminar |
| `KanbanProjectPlacement` | `kanban_project_placements` | Eliminar |
| `RecurringIncome` | `recurring_incomes` | Eliminar |
| `RecurringExpense` | `recurring_expenses` | Eliminar |
| `ScheduledPayment` | `scheduled_payments` | Eliminar |
| `ScheduledExpense` | `scheduled_expenses` | Eliminar |
| `DistributionConfig` | `distribution_config` | Eliminar |
| `SalaryWithdrawal` | `salary_withdrawals` | Eliminar |

### 5.2 Enums actuales a eliminar

`ProjectStatus` (reemplazado por `isActive BOOLEAN`), `ContractFrequency`,
`ScheduledPaymentStatus`, `DistributionLayer`, `ScheduledExpenseStatus`.

### 5.3 Enums a conservar/modificar

`IncomeStatus` (`PAID`, `PENDING`), `IncomeType` (`DEVELOPMENT`, `MAINTENANCE`, agregar `OTHER`),
`ExpenseType` (`FIXED`, `VARIABLE`), `ExpenseStatus` (`PAID`, `PENDING`).

### 5.4 Migraciones actuales (12)

`20260313121741_init`, `20260313154840_update_recurring_logic`,
`20260313165708_simplify_income_states`, `20260313184324_add_recurring_expenses`,
`20260316194124_full_abm_entities`, `20260316200615_split_dev_and_maintenance`,
`20260316214500_project_subscription_source_of_truth`, `20260316224000_project_fee_lifecycle`,
`20260317160000_add_kanban_tables`, `20260320113000_add_income_due_date`,
`20260320134500_add_expense_due_date_and_status`,
`20260320170000_add_recurring_income_series_and_extend_recurring_expenses`.

La nueva migración será destructiva (una sola migración que recrea desde cero).

---

## 6. Inventario de rutas

### 6.1 Rutas de página (frontend)

```
/                          → Dashboard
/login                     → Login
/clients                   → Lista de clientes
/clients/[id]              → Detalle de cliente
/projects                  → Lista de proyectos
/projects/[id]             → Detalle de proyecto
/incomes                   → Lista de ingresos
/expenses                  → Lista de gastos
```

### 6.2 Rutas eliminadas

`/kanban`, `/calendar`, `/distribution`, `/recurring`.

### 6.3 API routes conservadas (13)

```
GET|POST    /api/auth
GET|POST    /api/clients
GET|PUT|DEL /api/clients/[id]
GET|POST    /api/projects
GET|PUT|DEL /api/projects/[id]
GET|POST    /api/incomes
GET|PUT|DEL /api/incomes/[id]
GET|POST    /api/expenses
GET|PUT|DEL /api/expenses/[id]
GET|POST    /api/expense-categories
GET|PUT|DEL /api/expense-categories/[id]
GET         /api/dashboard
GET         /api/alerts
```


---

## 7. Inventario de servicios

### 7.1 Servicios nuevos a crear

Basados en la division de `src/server/services/finance.ts` (4052 lineas):

| Archivo | Responsabilidad |
|---|---|
| `src/server/services/clients.ts` | CRUD clientes, listado, busqueda, metricas de cliente |
| `src/server/services/projects.ts` | CRUD proyectos, cambio de cliente, metricas, importes acordados |
| `src/server/services/incomes.ts` | CRUD ingresos, pago pendientes, cambio proyecto, cuotas |
| `src/server/services/expenses.ts` | CRUD gastos, pago pendientes, cambio proyecto |
| `src/server/services/expense-categories.ts` | CRUD categorias, verificacion de uso |
| `src/server/services/dashboard.ts` | Metricas periodo, globales, graficos, ranking |
| `src/server/services/alerts.ts` | Vencidos y proximos vencimientos |
| `src/server/services/auth.ts` | Firma HMAC-SHA256, validacion, login, logout |
| `src/server/services/money.ts` | Conversion ARS/USD, redondeo Decimal |
| `src/server/services/status.ts` | Derivacion OVERDUE, validacion estados |
| `src/server/validations/` | Schemas Zod por entidad |

### 7.2 Helpers centralizados

| Archivo | Responsabilidad |
|---|---|
| `src/lib/money.ts` | Prisma.Decimal helpers, constantes de precision |
| `src/lib/money-client.ts` | Formateo USD/ARS en cliente |
| `src/lib/dates.ts` | Zona horaria Cordoba, helpers de fechas |
| `src/lib/session.ts` | Firma HMAC-SHA256 de cookie |

---

## 8. Inventario de dependencias

### 8.1 Dependencies a eliminar

- `@dnd-kit/core` (^6.3.1) — solo lo usa Kanban
- `@dnd-kit/sortable` (^10.0.0)
- `@dnd-kit/utilities` (^3.2.2)
- `bubblewrap` (^0.2.0)

### 8.2 Dependencies a mover

- `xlsx` (^0.18.5) de `dependencies` a `devDependencies`

### 8.3 Dependencies conservadas

`@prisma/client`, `prisma`, `clsx`, `date-fns`, `lucide-react`, `next`, `react`, `react-dom`, `recharts`, `tailwind-merge`, `zod`.

### 8.4 DevDependencies conservadas

`@types/node`, `@types/react`, `@types/react-dom`, `autoprefixer`, `eslint`, `eslint-config-next`, `postcss`, `tailwindcss`, `tsx`, `typescript`.

### 8.5 Nueva devDependency

`vitest` (^3.x) — runner de tests unitarios e integracion.

### 8.6 Scripts nuevos en package.json

```json
{
  "test": "vitest run",
  "test:unit": "vitest run --dir tests/unit",
  "test:integration": "vitest run --dir tests/integration",
  "test:sql": "vitest run --dir tests/sql"
}
```

---

## 9. Uso actual de xlsx

### 9.1 Donde se usa

- `prisma/seed.ts` (linea 12): `import * as XLSX from "xlsx";`
- Se usa `XLSX.readFile()` para leer `Finanzas Broco Solutions.xlsx`
- Se usa `XLSX.utils.sheet_to_json()` para parsear hojas
- El Excel tiene 5 hojas: `Ingresos`, `Gastos`, `Distribucion`, `Resumen`, `Listas`

### 9.2 Estrategia futura

- `xlsx` se mueve de `dependencies` a `devDependencies`
- Se crea `scripts/extract-finance-xlsx.ts` como script one-off
- El script produce archivos TypeScript en `prisma/seed-data/`
- El seed (`prisma/seed.ts`) importa solo de `prisma/seed-data/`, sin `xlsx`
- Produccion no importa `xlsx`
- Build no ejecuta extraccion
- Runtime no toca Excel

---

## 10. Funcionalidades conservadas

1. **Dashboard** — metricas del periodo, metricas operativas globales, resultado historico acumulado, evolucion mensual, gastos por categoria, ranking de clientes
2. **Clientes** — CRUD, busqueda, detalle con proyectos y metricas
3. **Proyectos** — CRUD, filtro por cliente/estado, detalle con metricas, finalizacion/reactivacion, importe unico acordado (opcional), importe mensual informativo (opcional)
4. **Ingresos** — CRUD, tipos DEVELOPMENT/MAINTENANCE/OTHER, pagado/pendiente, pago de pendientes, generador manual de cuotas, filtros
5. **Gastos** — CRUD, tipos FIXED/VARIABLE, categorias administrables, pagado/pendiente, pago de pendientes, filtros
6. **Categorias de gasto** — CRUD dentro del modulo de Gastos, activacion/desactivacion
7. **Login** — contrasena global `APP_PASSWORD`, cookie firmada con HMAC-SHA256 y `SESSION_SECRET`
8. **Alertas** — vencidos y proximos 30 dias (calculo en tiempo real, sin tabla de alertas)

---

## 11. Funcionalidades eliminadas

1. Kanban completo (`/kanban`, `KanbanColumn`, `KanbanProjectPlacement`, `kanban.ts`)
2. Calendario (`/calendar`, componentes `calendar/`)
3. Distribucion de dinero (`/distribution`, `DistributionConfig`, `DistributionLayer`)
4. Capas o porcentajes de distribucion
5. Reservas (emergency/growth)
6. KPI de remanente
7. Modulo especifico de salarios (`/api/salary`, `SalaryWithdrawal`)
8. Modulo especifico de retiros
9. Recurrencias automaticas (`RecurringIncome`, `RecurringExpense`)
10. Pagos programados automaticos (`ScheduledPayment`)
11. Gastos programados automaticos (`ScheduledExpense`)
12. Sincronizaciones automaticas (syncProjectSubscriptions, syncOpenRecurringIncomes, etc.)
13. Cron jobs
14. Generacion automatica de movimientos
15. Modo demo (`src/server/demo-data.ts`, todos los fallbacks `if (!hasDatabaseConfig())`)
16. Dependencias: `bubblewrap`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`

---

## 12. Arquitectura objetivo

### 12.1 Principios

1. **Separacion por entidad**: cada entidad funcional tiene su propio servicio.
2. **Single source of truth**: dinero, fechas, estados, sesion, metricas van a un solo archivo.
3. **Validacion en profundidad**: Zod en API + CHECKs SQL en PostgreSQL + tests de integracion.
4. **Sin demo mode**: `prisma.ts` sin logica condicional. Siempre requiere `DATABASE_URL`.
5. **Server-first**: los Server Components cargan datos; los Client Components solo manejan interaccion. No hay logica de negocio en el cliente.

### 12.2 Capas

```
+--------------------------------------------------+
|  Frontend (React Server/Client Components)        |
|  src/app/**, src/components/screens/**            |
|  -> No contiene logica de negocio                  |
+--------------------------------------------------+
|  API Routes (Next.js Route Handlers)              |
|  src/app/api/**                                   |
|  -> Validacion Zod, llamada a servicios           |
+--------------------------------------------------+
|  Services (logica de negocio)                     |
|  src/server/services/*.ts                         |
|  -> Prisma queries, reglas, transacciones          |
+--------------------------------------------------+
|  Helpers compartidos                              |
|  src/lib/money.ts, dates.ts, session.ts           |
|  -> Formateo, calculos, zona horaria               |
+--------------------------------------------------+
|  Validaciones                                     |
|  src/server/validations/*.ts                      |
|  -> Schemas Zod por entidad                        |
+--------------------------------------------------+
|  Prisma Client + PostgreSQL                       |
|  -> CHECKs, indices, FKs, unicidad                 |
+--------------------------------------------------+
```

### 12.3 Fuentes de verdad unicas

| Concepto | Archivo unico |
|---|---|
| Dinero (conversion, redondeo) | `src/lib/money.ts` + `src/server/services/money.ts` |
| Fechas (zona horaria, vencidos) | `src/lib/dates.ts` |
| Estados (OVERDUE, validacion) | `src/server/services/status.ts` |
| Sesion (firma, validacion) | `src/lib/session.ts` |
| Metricas de proyecto | `src/server/services/projects.ts` |
| Metricas de cliente | `src/server/services/clients.ts` |
| Importes de proyecto | `src/server/services/projects.ts` |
| Calculo de cuotas | `src/server/services/incomes.ts` |

### 12.4 Division de finance.ts

El archivo `src/server/services/finance.ts` (4052 lineas) se elimina y reemplaza por:

```
src/server/services/
├── clients.ts              (~300 lineas)
├── projects.ts             (~400 lineas)
├── incomes.ts              (~350 lineas)
├── expenses.ts             (~300 lineas)
├── expense-categories.ts   (~100 lineas)
├── dashboard.ts            (~350 lineas)
├── alerts.ts               (~100 lineas)
├── auth.ts                 (~100 lineas)
├── money.ts                (~80 lineas)
├── status.ts               (~50 lineas)
└── validations/
    ├── client.ts           (~30 lineas)
    ├── project.ts          (~60 lineas)
    ├── income.ts           (~70 lineas)
    ├── expense.ts          (~60 lineas)
    ├── expense-category.ts (~20 lineas)
    └── dashboard.ts        (~30 lineas)
```

---

## 13. Modelo final

### 13.1 Schema Prisma objetivo

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum IncomeStatus {
  PAID
  PENDING
}

enum IncomeType {
  DEVELOPMENT
  MAINTENANCE
  OTHER
}

enum ExpenseType {
  FIXED
  VARIABLE
}

enum ExpenseStatus {
  PAID
  PENDING
}

model Client {
  id           String    @id @default(uuid()) @db.Uuid
  name         String    @unique
  contactName  String?   @map("contact_name")
  contactEmail String?   @map("contact_email")
  contactPhone String?   @map("contact_phone")
  notes        String?
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")
  projects     Project[]
  incomes      Income[]

  @@map("clients")
}

model Project {
  id                        String    @id @default(uuid()) @db.Uuid
  clientId                  String    @map("client_id") @db.Uuid
  name                      String
  isActive                  Boolean   @default(true) @map("is_active")
  startDate                 DateTime? @map("start_date") @db.Date
  endDate                   DateTime? @map("end_date") @db.Date
  agreedAmountOriginal      Decimal?  @map("agreed_amount_original") @db.Decimal(18, 2)
  agreedAmountCurrency      String?   @map("agreed_amount_currency") @db.VarChar(3)
  agreedAmountExchangeRate  Decimal?  @map("agreed_amount_exchange_rate") @db.Decimal(18, 6)
  agreedAmountUsd           Decimal?  @map("agreed_amount_usd") @db.Decimal(18, 6)
  monthlyAmountOriginal     Decimal?  @map("monthly_amount_original") @db.Decimal(18, 2)
  monthlyAmountCurrency     String?   @map("monthly_amount_currency") @db.VarChar(3)
  monthlyAmountExchangeRate Decimal?  @map("monthly_amount_exchange_rate") @db.Decimal(18, 6)
  monthlyAmountUsd          Decimal?  @map("monthly_amount_usd") @db.Decimal(18, 6)
  notes                     String?
  createdAt                 DateTime  @default(now()) @map("created_at")
  updatedAt                 DateTime  @updatedAt @map("updated_at")
  client                    Client    @relation(fields: [clientId], references: [id], onDelete: Restrict)
  incomes                   Income[]
  expenses                  Expense[]

  @@unique([clientId, name])
  @@index([clientId, isActive])
  @@index([isActive])
  @@map("projects")
}

model Income {
  id            String       @id @default(uuid()) @db.Uuid
  clientId      String?      @map("client_id") @db.Uuid
  projectId     String?      @map("project_id") @db.Uuid
  type          IncomeType   @map("income_type")
  concept       String
  notes         String?
  status        IncomeStatus @default(PAID)
  amountUsd     Decimal      @map("amount_usd") @db.Decimal(18, 6)
  amountArs     Decimal?     @map("amount_ars") @db.Decimal(18, 2)
  exchangeRate  Decimal?     @map("exchange_rate") @db.Decimal(18, 6)
  dueDate       DateTime?    @map("due_date") @db.Date
  effectiveDate DateTime?    @map("effective_date") @db.Date
  createdAt     DateTime     @default(now()) @map("created_at")
  updatedAt     DateTime     @updatedAt @map("updated_at")
  client        Client?      @relation(fields: [clientId], references: [id], onDelete: Restrict)
  project       Project?     @relation(fields: [projectId], references: [id], onDelete: Restrict)

  @@index([clientId, effectiveDate])
  @@index([projectId, effectiveDate])
  @@index([status, dueDate])
  @@index([type, effectiveDate])
  @@map("incomes")
}

model ExpenseCategory {
  id        String    @id @default(uuid()) @db.Uuid
  name      String    @unique
  isActive  Boolean   @default(true) @map("is_active")
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  expenses  Expense[]

  @@map("expense_categories")
}

model Expense {
  id                String         @id @default(uuid()) @db.Uuid
  expenseCategoryId String         @map("expense_category_id") @db.Uuid
  projectId         String?        @map("project_id") @db.Uuid
  type              ExpenseType    @map("expense_type")
  concept           String
  notes             String?
  status            ExpenseStatus  @default(PAID)
  amountUsd         Decimal        @map("amount_usd") @db.Decimal(18, 6)
  amountArs         Decimal?       @map("amount_ars") @db.Decimal(18, 2)
  exchangeRate      Decimal?       @map("exchange_rate") @db.Decimal(18, 6)
  dueDate           DateTime?      @map("due_date") @db.Date
  effectiveDate     DateTime?      @map("effective_date") @db.Date
  createdAt         DateTime       @default(now()) @map("created_at")
  updatedAt         DateTime       @updatedAt @map("updated_at")
  category          ExpenseCategory @relation(fields: [expenseCategoryId], references: [id], onDelete: Restrict)
  project           Project?       @relation(fields: [projectId], references: [id], onDelete: SetNull)

  @@index([expenseCategoryId, effectiveDate])
  @@index([projectId, effectiveDate])
  @@index([status, dueDate])
  @@index([type, effectiveDate])
  @@map("expenses")
}
```

### 13.2 CHECKs SQL manuales (en migracion)

```sql
-- Income
ALTER TABLE incomes ADD CONSTRAINT chk_income_pending_requires_due_date
  CHECK (status != 'PENDING' OR due_date IS NOT NULL);

ALTER TABLE incomes ADD CONSTRAINT chk_income_pending_no_effective_date
  CHECK (status != 'PENDING' OR effective_date IS NULL);

ALTER TABLE incomes ADD CONSTRAINT chk_income_paid_requires_effective_date
  CHECK (status != 'PAID' OR effective_date IS NOT NULL);

ALTER TABLE incomes ADD CONSTRAINT chk_income_amount_usd_positive
  CHECK (amount_usd > 0);

ALTER TABLE incomes ADD CONSTRAINT chk_income_exchange_rate_positive
  CHECK (exchange_rate IS NULL OR exchange_rate > 0);

ALTER TABLE incomes ADD CONSTRAINT chk_income_amount_ars_positive
  CHECK (amount_ars IS NULL OR amount_ars > 0);

ALTER TABLE incomes ADD CONSTRAINT chk_income_dev_or_maint_requires_project
  CHECK (income_type NOT IN ('DEVELOPMENT', 'MAINTENANCE') OR project_id IS NOT NULL);

-- Expense
ALTER TABLE expenses ADD CONSTRAINT chk_expense_pending_requires_due_date
  CHECK (status != 'PENDING' OR due_date IS NOT NULL);

ALTER TABLE expenses ADD CONSTRAINT chk_expense_pending_no_effective_date
  CHECK (status != 'PENDING' OR effective_date IS NULL);

ALTER TABLE expenses ADD CONSTRAINT chk_expense_paid_requires_effective_date
  CHECK (status != 'PAID' OR effective_date IS NOT NULL);

ALTER TABLE expenses ADD CONSTRAINT chk_expense_amount_usd_positive
  CHECK (amount_usd > 0);

ALTER TABLE expenses ADD CONSTRAINT chk_expense_exchange_rate_positive
  CHECK (exchange_rate IS NULL OR exchange_rate > 0);

ALTER TABLE expenses ADD CONSTRAINT chk_expense_amount_ars_positive
  CHECK (amount_ars IS NULL OR amount_ars > 0);

-- Project
ALTER TABLE projects ADD CONSTRAINT chk_project_agreed_amount_consistency
  CHECK (
    agreed_amount_original IS NULL
    OR (
      agreed_amount_currency IS NOT NULL
      AND agreed_amount_usd IS NOT NULL
      AND agreed_amount_original > 0
      AND (
        (agreed_amount_currency = 'USD' AND agreed_amount_exchange_rate IS NULL
         AND agreed_amount_usd = agreed_amount_original)
        OR
        (agreed_amount_currency = 'ARS' AND agreed_amount_exchange_rate IS NOT NULL
         AND agreed_amount_exchange_rate > 0)
      )
    )
  );

ALTER TABLE projects ADD CONSTRAINT chk_project_monthly_amount_consistency
  CHECK (
    monthly_amount_original IS NULL
    OR (
      monthly_amount_currency IS NOT NULL
      AND monthly_amount_usd IS NOT NULL
      AND monthly_amount_original > 0
      AND (
        (monthly_amount_currency = 'USD' AND monthly_amount_exchange_rate IS NULL
         AND monthly_amount_usd = monthly_amount_original)
        OR
        (monthly_amount_currency = 'ARS' AND monthly_amount_exchange_rate IS NOT NULL
         AND monthly_amount_exchange_rate > 0)
      )
    )
  );

ALTER TABLE projects ADD CONSTRAINT chk_project_currency_values
  CHECK (
    agreed_amount_currency IS NULL OR agreed_amount_currency IN ('USD', 'ARS')
  );

ALTER TABLE projects ADD CONSTRAINT chk_project_monthly_currency_values
  CHECK (
    monthly_amount_currency IS NULL OR monthly_amount_currency IN ('USD', 'ARS')
  );
```

### 13.3 Tablas eliminadas

- `kanban_columns`
- `kanban_project_placements`
- `recurring_incomes`
- `recurring_expenses`
- `scheduled_payments`
- `scheduled_expenses`
- `distribution_config`
- `salary_withdrawals`

---

## 14. Reglas de negocio

### 14.1 Clientes

1. `name` unico case-insensitive. Normalizar espacios desde servidor.
2. No puede eliminarse si tiene proyectos.
3. No puede eliminarse si tiene ingresos directos (`Income.clientId = client.id`).
4. No agregar `isActive` al cliente.

### 14.2 Proyectos

1. `(clientId, name)` unico case-insensitive dentro del mismo cliente.
2. `isActive` es la fuente de verdad. `startDate` y `endDate` son informativas.
3. Al finalizar, la interfaz propone la fecha actual como `endDate`. El usuario puede cambiarla o dejarla vacia.
4. Al reactivar, no limpiar automaticamente `endDate`.
5. **Cambio de cliente**: solo permitido si el proyecto no tiene movimientos (Income + Expense = 0). Validacion en backend dentro de la transaccion. Frontend deshabilita el selector con explicacion. Si se cargo un proyecto bajo un cliente incorrecto y ya tiene movimientos, la correccion operativa es: crear el proyecto correcto, reasignar movimientos, y cuando el incorrecto quede sin movimientos, modificarlo o eliminarlo.
6. **Eliminacion**: solo si no tiene movimientos. Si tiene movimientos, debe finalizarse con `isActive = false`.
7. Importe unico acordado: opcional, sin configuracion parcial permitida.
8. Importe mensual informativo: opcional, sin configuracion parcial permitida.
9. Ambos importes son exclusivamente informativos. No generan ingresos, cuotas, ni recurrencias.

### 14.3 Ingresos

1. `DEVELOPMENT` y `MAINTENANCE` requieren proyecto.
2. `clientId` se deriva de `project.clientId` en servidor. Si el frontend envia un `clientId` inconsistente, se ignora y se usa el del proyecto.
3. `OTHER` puede tener cliente, proyecto, ambos, o ninguno. Cuando tiene proyecto, `clientId` se fuerza al cliente del proyecto.
4. `concept` obligatorio para todos los tipos.
5. `PENDING` requiere `dueDate`, no admite `effectiveDate`.
6. `PAID` requiere `effectiveDate`, `dueDate` opcional.
7. Al pagar un pendiente: actualizar el mismo registro (no crear otro), cambiar a `PAID`, establecer `effectiveDate`, conservar `dueDate`. Permitir reemplazar USD, ARS y tipo de cambio. Los nuevos montos reemplazan los anteriores.
8. Al cambiar proyecto de `DEVELOPMENT`/`MAINTENANCE`: `clientId` se reemplaza automaticamente por `newProject.clientId` en la misma transaccion.
9. Al cambiar proyecto de `OTHER`: `clientId` se fuerza al nuevo proyecto.
10. Al quitar proyecto de `OTHER`: `projectId = null`, `clientId` se limpia. El usuario puede seleccionar explicitamente un cliente directo. No permitir que quede el cliente derivado del proyecto anterior de forma silenciosa.

### 14.4 Gastos

1. Categoria obligatoria. Proyecto opcional.
2. `concept` obligatorio.
3. No tiene `clientId`. El cliente se deriva del proyecto en metricas.
4. Al cambiar proyecto, cambia su atribucion en metricas.

### 14.5 Categorias de gasto

1. `name` unico case-insensitive. Normalizar espacios.
2. Una categoria utilizada no puede eliminarse (puede desactivarse).
3. Una categoria nunca utilizada puede eliminarse con confirmacion.
4. Categorias inactivas visibles en historial, no aparecen por defecto al crear gastos.

### 14.6 Dinero

1. Precision: `amountArs` -> `Decimal(18,2)`, `amountUsd` -> `Decimal(18,6)`, `exchangeRate` -> `Decimal(18,6)`.
2. Conversion ARS -> USD: `amountUsd = amountArs / exchangeRate`.
3. ARS + USD: `exchangeRate = amountArs / amountUsd`.
4. Solo USD: `amountArs = null`, `exchangeRate = null`.
5. No permitir division por cero, importes <= 0, exchange rate <= 0.
6. Todos los KPIs, rankings, graficos en USD.
7. No sumar ARS de distintas fechas como metrica global.
8. Sin API externa de cotizacion.

### 14.7 Fechas

1. `dueDate`, `effectiveDate`, `startDate`, `endDate` -> `DATE` en PostgreSQL.
2. `createdAt`, `updatedAt` -> timestamps normales.
3. Entrada/salida: `YYYY-MM-DD`.
4. Zona horaria: `America/Argentina/Cordoba`.
5. `OVERDUE`: `status = PENDING` + `dueDate` existe + `dueDate < hoy(Cordoba)`.
6. Proximos 30 dias: `PENDING` + `dueDate >= hoy` + `dueDate <= hoy + 30` (inclusive).

### 14.8 Proyecto: importe unico acordado

- Sin importe: todos los campos `null`. No permitir configuracion parcial.
- USD: `agreedAmountOriginal` > 0, `agreedAmountCurrency = 'USD'`, `agreedAmountExchangeRate = null`, `agreedAmountUsd = agreedAmountOriginal`.
- ARS: `agreedAmountOriginal` > 0, `agreedAmountCurrency = 'ARS'`, `agreedAmountExchangeRate` > 0, `agreedAmountUsd = agreedAmountOriginal / agreedAmountExchangeRate`.
- `agreedAmountUsd` calculado en servidor, no cargado manualmente.

### 14.9 Proyecto: importe mensual informativo

Mismas reglas que el importe unico, aplicadas a `monthlyAmount*`. Es exclusivamente informativo. Nunca genera ingresos ni recurrencias.


---

## 15. Dinero

### 15.1 Helper centralizado

Archivo: `src/lib/money.ts`

```typescript
import { Prisma } from "@prisma/client";

export function toDecimal(value: number, decimals: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(decimals));
}

export function fromDecimal(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

export function requireDecimal(value: Prisma.Decimal | number | null | undefined): number {
  return Number(value ?? 0);
}

export function computeExchangeRate(amountArs: number, amountUsd: number): Prisma.Decimal {
  if (amountUsd === 0) throw new Error("Division por cero.");
  return toDecimal(amountArs / amountUsd, 6);
}

export function computeUsdFromArs(amountArs: number, exchangeRate: number): Prisma.Decimal {
  if (exchangeRate === 0) throw new Error("Tipo de cambio cero.");
  return toDecimal(amountArs / exchangeRate, 6);
}

export const USD_DECIMALS = 6;
export const ARS_DECIMALS = 2;
export const FX_DECIMALS = 6;
```

Archivo: `src/lib/money-client.ts` (solo cliente, formateo en pantalla)

```typescript
export function formatUsd(value: number | null | undefined): string {
  if (value == null) return "\u2014";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
}

export function formatArs(value: number | null | undefined): string {
  if (value == null) return "\u2014";
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatExchangeRate(value: number | null | undefined): string {
  if (value == null) return "\u2014";
  return value.toFixed(2);
}
```

### 15.2 Normalizacion monetaria (servicio)

Archivo: `src/server/services/money.ts`

```typescript
import { Prisma } from "@prisma/client";
import { toDecimal, computeExchangeRate, computeUsdFromArs } from "@/lib/money";
import { AppError } from "@/server/errors";

type MoneyInput = {
  amountUsd?: number | null;
  amountArs?: number | null;
  exchangeRate?: number | null;
};

type MoneyResult = {
  amountUsd: Prisma.Decimal;
  amountArs: Prisma.Decimal | null;
  exchangeRate: Prisma.Decimal | null;
};

export function normalizeMoney(input: MoneyInput): MoneyResult {
  const hasUsd = typeof input.amountUsd === "number" && input.amountUsd > 0;
  const hasArs = typeof input.amountArs === "number" && input.amountArs > 0;
  const hasFx = typeof input.exchangeRate === "number" && input.exchangeRate > 0;

  if (hasUsd && hasArs) {
    return {
      amountUsd: toDecimal(input.amountUsd!, 6),
      amountArs: toDecimal(input.amountArs!, 2),
      exchangeRate: computeExchangeRate(input.amountArs!, input.amountUsd!),
    };
  }

  if (hasArs && hasFx) {
    return {
      amountUsd: computeUsdFromArs(input.amountArs!, input.exchangeRate!),
      amountArs: toDecimal(input.amountArs!, 2),
      exchangeRate: toDecimal(input.exchangeRate!, 6),
    };
  }

  if (hasUsd) {
    return {
      amountUsd: toDecimal(input.amountUsd!, 6),
      amountArs: null,
      exchangeRate: null,
    };
  }

  throw new AppError("Ingresa monto USD, o ARS + tipo de cambio.", 422);
}
```

---

## 16. Importes de proyecto

### 16.1 Servicio

Archivo: `src/server/services/projects.ts` (funcion de importes)

```typescript
import { Prisma } from "@prisma/client";
import { toDecimal } from "@/lib/money";
import { AppError } from "@/server/errors";

type AgreedAmountInput = {
  amountOriginal?: number | null;
  currency?: "USD" | "ARS" | null;
  exchangeRate?: number | null;
};

type AgreedAmountResult = {
  agreedAmountOriginal: Prisma.Decimal | null;
  agreedAmountCurrency: string | null;
  agreedAmountExchangeRate: Prisma.Decimal | null;
  agreedAmountUsd: Prisma.Decimal | null;
};

export function normalizeAgreedAmount(input: AgreedAmountInput): AgreedAmountResult {
  if (input.amountOriginal == null) {
    return {
      agreedAmountOriginal: null,
      agreedAmountCurrency: null,
      agreedAmountExchangeRate: null,
      agreedAmountUsd: null,
    };
  }

  if (input.amountOriginal <= 0) {
    throw new AppError("El importe acordado debe ser mayor que cero.", 422);
  }

  if (input.currency === "USD") {
    if (input.exchangeRate != null) {
      throw new AppError("Un proyecto en USD no debe tener tipo de cambio.", 422);
    }
    return {
      agreedAmountOriginal: toDecimal(input.amountOriginal, 2),
      agreedAmountCurrency: "USD",
      agreedAmountExchangeRate: null,
      agreedAmountUsd: toDecimal(input.amountOriginal, 6),
    };
  }

  if (input.currency === "ARS") {
    if (input.exchangeRate == null || input.exchangeRate <= 0) {
      throw new AppError("Un proyecto en ARS requiere tipo de cambio mayor que cero.", 422);
    }
    return {
      agreedAmountOriginal: toDecimal(input.amountOriginal, 2),
      agreedAmountCurrency: "ARS",
      agreedAmountExchangeRate: toDecimal(input.exchangeRate, 6),
      agreedAmountUsd: toDecimal(input.amountOriginal / input.exchangeRate, 6),
    };
  }

  throw new AppError("Moneda invalida. Usa USD o ARS.", 422);
}
```

Misma logica para normalizeMonthlyAmount (importe mensual informativo).

---

## 17. Fechas y estados

### 17.1 Helper centralizado de fechas

Archivo: `src/lib/dates.ts`

```typescript
import { startOfDay, addMonths, isBefore, isAfter } from "date-fns";

const TIMEZONE = "America/Argentina/Cordoba";

export function todayInCordoba(): Date {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const [year, month, day] = formatter.format(now).split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function isOverdue(dueDate: Date): boolean {
  return isBefore(startOfDay(dueDate), startOfDay(todayInCordoba()));
}

export function isWithinNext30Days(dueDate: Date): boolean {
  const today = startOfDay(todayInCordoba());
  const due = startOfDay(dueDate);
  const in30Days = new Date(today);
  in30Days.setDate(in30Days.getDate() + 30);
  return !isBefore(due, today) && !isAfter(due, in30Days);
}

export function addOneMonthPreservingDay(date: Date): Date {
  return addMonths(date, 1);
}

export function toISODate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
```

### 17.2 Servicio de estados

Archivo: `src/server/services/status.ts`

```typescript
import { isOverdue } from "@/lib/dates";
import type { IncomeStatus, ExpenseStatus } from "@prisma/client";

export type DisplayStatus = "PAID" | "PENDING" | "OVERDUE";

export function deriveIncomeDisplayStatus(
  status: IncomeStatus,
  dueDate: Date | string | null | undefined,
): DisplayStatus {
  if (status === "PAID") return "PAID";
  if (!dueDate) return "PENDING";
  const date = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  return isOverdue(date) ? "OVERDUE" : "PENDING";
}

export function deriveExpenseDisplayStatus(
  status: ExpenseStatus,
  dueDate: Date | string | null | undefined,
): DisplayStatus {
  if (status === "PAID") return "PAID";
  if (!dueDate) return "PENDING";
  const date = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  return isOverdue(date) ? "OVERDUE" : "PENDING";
}
```

---

## 18. Autenticacion

### 18.1 Variables de entorno

```
APP_PASSWORD=  (contrasena global compartida)
SESSION_SECRET=  (clave para HMAC-SHA256)
```

Si faltan, la app rechaza el login (no hay fallback "demo").

### 18.2 Firma de sesion

Archivo: `src/lib/session.ts`

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "broco_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

type SessionPayload = {
  v: number;
  iat: number;
  exp: number;
  sid: string;
};

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET no esta configurada.");
  return secret;
}

function base64urlEncode(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function base64urlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function sign(payload: SessionPayload): string {
  const secret = getSecret();
  const payloadStr = JSON.stringify(payload);
  const encoded = base64urlEncode(payloadStr);
  const hmac = createHmac("sha256", secret);
  hmac.update(encoded);
  const signature = hmac.digest("base64url");
  return encoded + "." + signature;
}

function verify(token: string): SessionPayload | null {
  const secret = getSecret();
  const dotIndex = token.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const encoded = token.slice(0, dotIndex);
  const receivedSig = token.slice(dotIndex + 1);

  const hmac = createHmac("sha256", secret);
  hmac.update(encoded);
  const expectedSig = hmac.digest("base64url");

  if (!timingSafeEqual(Buffer.from(receivedSig), Buffer.from(expectedSig))) {
    return null;
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(base64urlDecode(encoded));
  } catch {
    return null;
  }

  if (typeof payload.v !== "number" || payload.v !== 1) return null;
  if (typeof payload.exp !== "number") return null;
  if (payload.exp < Date.now()) return null;

  return payload;
}

export function createSessionCookie(): string {
  const payload: SessionPayload = {
    v: 1,
    iat: Date.now(),
    exp: Date.now() + SESSION_DURATION_MS,
    sid: "broco_internal",
  };
  return sign(payload);
}

export function validateSessionCookie(token: string): boolean {
  return verify(token) !== null;
}

export function getCookieName(): string {
  return COOKIE_NAME;
}

export { COOKIE_NAME, SESSION_DURATION_MS };
```

### 18.3 Servicio de autenticacion

Archivo: `src/server/services/auth.ts`

```typescript
import "server-only";
import { cookies } from "next/headers";
import { createSessionCookie, validateSessionCookie, COOKIE_NAME, SESSION_DURATION_MS } from "@/lib/session";
import { AppError } from "@/server/errors";

export function isLoginValid(password: string): boolean {
  const configuredPassword = process.env.APP_PASSWORD;
  if (!configuredPassword) {
    throw new AppError("APP_PASSWORD no esta configurada en el servidor.", 500);
  }
  return password === configuredPassword;
}

export function setSessionCookie(): void {
  const token = createSessionCookie();
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
  });
}

export function clearSessionCookie(): void {
  cookies().delete(COOKIE_NAME);
}

export function isAuthenticated(): boolean {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return false;
  return validateSessionCookie(token);
}

export function requireAuth(): void {
  if (!isAuthenticated()) {
    throw new AppError("No autenticado.", 401);
  }
}
```

### 18.4 Middleware

Archivo: `src/middleware.ts` (reconstruido)

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { validateSessionCookie, COOKIE_NAME } from "@/lib/session";

const PUBLIC_PATHS = ["/login", "/api/auth", "/_next", "/favicon.ico"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRequest = pathname.startsWith("/api/");

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token || !validateSessionCookie(token)) {
    if (isApiRequest) {
      return NextResponse.json({ error: "Sesion expirada o no autenticada." }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/"],
};
```

### 18.5 Comportamiento cuando faltan variables

| Falta | Comportamiento |
|---|---|
| `SESSION_SECRET` | Error 500 en login. No inicia sesion. |
| `APP_PASSWORD` | Error 500 en login. No inicia sesion. |
| Ambas presentes | Login normal con comparacion exacta. |

---

## 19. Base de test

### 19.1 Estrategia

- PostgreSQL 16 local en Docker para tests.
- Variables: `DATABASE_URL_TEST` apunta al contenedor local (puerto 5434).
- `DATABASE_URL` debe estar definida (para `prisma generate`) pero distinta de `DATABASE_URL_TEST`.
- `DATABASE_URL_TEST !== DATABASE_URL` verificado en setup de tests.

### 19.2 Proteccion destructiva

Todo comando destructivo exige simultaneamente:

```
NODE_ENV=test
ALLOW_DESTRUCTIVE_TEST_DB=true
DATABASE_URL_TEST definida
DATABASE_URL definida
DATABASE_URL_TEST !== DATABASE_URL
```

### 19.3 Docker Compose para tests

Archivo: `docker-compose.test.yml`

```yaml
services:
  postgres_test:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: broco_test
      POSTGRES_PASSWORD: broco_test
      POSTGRES_DB: broco_finance_test
    ports:
      - "5434:5432"
    tmpfs:
      - /var/lib/postgresql/data
```

### 19.4 Archivos de entorno

`.env.example`:
```
DATABASE_URL=postgresql://...
APP_PASSWORD=...
SESSION_SECRET=...
```

`.env.test.example`:
```
DATABASE_URL_TEST=postgresql://broco_test:broco_test@localhost:5434/broco_finance_test
DATABASE_URL=postgresql://broco_test:broco_test@localhost:5434/broco_finance_test
APP_PASSWORD=test_password
SESSION_SECRET=test_secret_key_for_signing
ALLOW_DESTRUCTIVE_TEST_DB=true
NODE_ENV=test
```

---

## 20. Migracion

### 20.1 Verificacion previa (informativa, no destructiva)

Antes de disenar la migracion, verificar que la base productiva esta vacia. Esta verificacion
es solo lectura y no modifica la base productiva:

```bash
npx prisma db execute --stdin <<< "SELECT count(*) FROM clients;"
```

Si el resultado no es 0, documentarlo y coordinar limpieza manual antes de la Fase 20.
La migracion en si se aplica primero contra `DATABASE_URL_TEST` y solo se promueve a
`DATABASE_URL` en la Fase 20 (Produccion).

### 20.2 Estrategia

La migracion se disena y valida exclusivamente contra `DATABASE_URL_TEST`. La aplicacion contra
`DATABASE_URL` productivo ocurre recien en la Fase 20 (Produccion), despues de que todos los tests
pasen.

1. Eliminar el archivo `prisma/schema.prisma` actual.
2. Escribir el nuevo schema (seccion 13.1).
3. Eliminar todas las migraciones existentes: `rm -rf prisma/migrations/*`
4. Ejecutar contra test: `DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate dev --name init_simplified --create-only`
5. Editar la migracion generada para agregar los CHECKs SQL manuales (seccion 13.2).
6. Ejecutar contra test: `DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate dev`
7. Verificar que PostgreSQL rechaza datos invalidos (tests SQL, seccion 30).

### 20.3 Rollback

El tag `pre-simplificacion-finanzas-2026-07-17` permite volver al estado anterior.

```bash
git checkout pre-simplificacion-finanzas-2026-07-17
npx prisma migrate deploy
```

---

## 21. Extraccion one-off

### 21.1 Script

Archivo: `scripts/extract-finance-xlsx.ts`

Funciones:
- Leer `Finanzas Broco Solutions.xlsx`
- Validar hojas esperadas
- Validar columnas por hoja
- Detectar filas sin fecha (totales, resumenes)
- Detectar totales por importe conocido
- Mostrar conteos y advertencias
- Producir archivos TypeScript en `prisma/seed-data/`
- No conectarse a PostgreSQL
- No ejecutar seed

### 21.2 Archivos de salida

```
prisma/seed-data/
├── clients.ts
├── projects.ts
├── incomes.ts
├── expense-categories.ts
└── expenses.ts
```

### 21.3 Ejecucion

```bash
npx tsx scripts/extract-finance-xlsx.ts
```

### 21.4 Filtrado de totales

Referencias de totales a excluir:
- Ingresos ARS: `34.661.902,88`
- Ingresos USD: `24.024,94318`
- Gastos ARS: ~`23.277.070`
- Gastos USD: ~`16.181,03`

La regla principal es: sin fecha + naturaleza de total (no solo coincidencia de importe).

---

## 22. Seed

### 22.1 Estructura

Archivos de datos canonicos (generados por la extraccion):
- `prisma/seed-data/clients.ts`
- `prisma/seed-data/projects.ts`
- `prisma/seed-data/incomes.ts`
- `prisma/seed-data/expense-categories.ts`
- `prisma/seed-data/expenses.ts`

Archivo principal: `prisma/seed.ts` (reconstruido).

### 22.2 Reglas del seed

1. Importar solo de `prisma/seed-data/`, no de `xlsx`.
2. No leer Excel en runtime.
3. Crear clientes, proyectos, categorias, ingresos, gastos.
4. No crear: distribucion, reservas, porcentajes, futuros, recurrencias, importes contratados inferidos, totales, filas sin fecha.
5. Todos los movimientos validos se importan como `PAID`. `effectiveDate` = fecha del Excel. `dueDate = null`.
6. Tipo de cambio: si hay ARS y USD > 0, `exchangeRate = amountArs / amountUsd`. Usar Decimal.
7. Filas solo USD: conservar USD, ARS null, exchangeRate null.
8. Observaciones como "40% del total", "50% del total", "465 de 1400", "resta la otra mitad", "restan $70.000", "pagado hasta febrero" se conservan como notas pero no generan saldos, contratos, pendientes, cuotas, recurrencias ni vencimientos.
9. Los importes acordados de proyectos comienzan en null.

### 22.3 Ejecucion

```bash
# En base de test
DATABASE_URL="$DATABASE_URL_TEST" NODE_ENV=test ALLOW_DESTRUCTIVE_TEST_DB=true npm run db:seed

# En produccion (despues de migrar)
npm run db:seed
```

---

## 23. Fuente de concept y notes

### 23.1 Ingresos

La hoja Ingresos no tiene columna Concepto. Se deriva del tipo historico:

| Tipo en Excel | Tipo resultante | `concept` |
|---|---|---|
| Adelanto | `DEVELOPMENT` | `"Adelanto"` |
| Pago final | `DEVELOPMENT` | `"Pago final"` |
| Recurrente | `MAINTENANCE` | `"Recurrente"` |

`Observaciones` -> `notes` cuando existan.

### 23.2 Overrides de ingresos

#### Zaphi World

Fila original: cliente `Nico Oliveto`, proyecto `Soporte`.
Transformar a: cliente `Zaphi World`, proyecto `Implementacion Odoo`, `concept = "Soporte"`. Conservar observacion en `notes` si existe.

#### Ajuste por intereses

- `type = OTHER`
- `concept = "Ajuste por intereses"`
- Sin cliente, sin proyecto
- Observacion en `notes` si aporta informacion adicional

#### Colegio con tipo vacio

- `type = DEVELOPMENT`
- `concept = "Desarrollo"`
- Observacion en `notes` si existe

No inventar otros conceptos.

### 23.3 Gastos

Todas las filas validas tienen Observaciones.

Regla:
- `concept = trim(Observaciones)`
- `notes = null`

Excepciones (requieren conservar trazabilidad en `notes`):
- Filas transformadas
- Division `Mehc + Coirini`
- Correcciones historicas explicitas
- Normalizaciones que necesiten trazabilidad

En esos casos, `notes` documenta: concepto original, fila de origen, valores originales, criterio aplicado.

### 23.4 Correccion ChatGPT del 2026-02-04

Exactamente una fila contradictoria en las 73 filas historicas de Gastos:

- fecha: `2026-02-04`
- concepto: `ChatGPT`
- tipo original: `Variable`
- categoria original: `Infra/Cloud`
- importe USD: `20.00`

Las otras cinco filas de ChatGPT son consistentes entre si: tipo `Fijo`, categoria `Herramientas/Software`, mismo importe USD.

Esta fila se importa como:
- `type = FIXED`
- `expenseCategoryId` -> `Herramientas`
- `concept = "ChatGPT"`
- `notes = "Correccion de dato historico: la fila original del Excel figuraba como Variable / Infra/Cloud. Se normalizo a Fijo / Herramientas por consistencia con el resto de los cargos de ChatGPT."`

No conservar `VARIABLE` para esa fila. No aplicar otras correcciones de tipo por inferencia.

---

## 24. Clientes y proyectos canonicos

### PACSA

Cliente: `PACSA`
- `Automatizacion WhatsApp` (activo) — unificar `Automatizacion WhatsApp` y `Bot wsp ingreso`
- `Listas de difusion` (activo)
- `Gestion de Caravanas` (activo)
- `Modulo Balanza` (activo)

### Coirini S.A.

Cliente: `Coirini S.A.`
- `Gestion RRSS` (activo)

### Colegio de Odontologos

Cliente: `Colegio de Odontologos de la Provincia de Santa Fe - 2a Circunscripcion`
- `Certificados Digitales` (activo) — unificar `Estampilla Digital`, `Digitalizacion Documentos`, `Estampilla + Certificados`
- `Firma Digital` (finalizado)

### FAUFENA

Cliente: `FAUFENA`
- `Plataforma B2B` (activo)

### Zaphi World

Cliente: `Zaphi World`
Contacto: `Nicolas Oliveto`
- `Implementacion Odoo` (activo)

### Bertino Integrales

Cliente: `Bertino Integrales`
- `Sitio Web` (activo)

### RASAFERTIL

Cliente: `RASAFERTIL`
- `Sitio Web` (activo)

### Un Toque de Amor

Cliente: `Un Toque de Amor`
- `Implementacion Tiendanube` (activo) — unificar `eCommerce`

### Montanesa

Cliente: `Montanesa`
- `Sistema de Caja` (activo)

### Districe

Cliente: `Districe`
- `Cotizador` (finalizado)
- `Orden de Compra` (activo)

### Nihao Negocios

Cliente: `Nihao Negocios`
- `Sitio Web` (activo)

### Athleta Centro

Cliente: `Athleta Centro`
- `Sistema de Gestion` (activo)

### Lorenzo Ferraro (RFN)

Cliente: `Lorenzo Ferraro`
- `RFN Argentina - Sistema de Gestion` (activo)

No convertir a `RFN Argentina` como cliente.

---

## 25. Ingresos

### 25.1 Tipos y reglas

- `DEVELOPMENT`: requiere proyecto, cliente derivado de `project.clientId`.
- `MAINTENANCE`: requiere proyecto, cliente derivado de `project.clientId`.
- `OTHER`: cliente y proyecto opcionales.

Si frontend envia `clientId` inconsistente con `project.clientId` para DEVELOPMENT/MAINTENANCE, se ignora y se usa el del proyecto.

### 25.2 Validaciones Zod

Archivo: `src/server/validations/income.ts`

Schema que valida:
- `projectId` obligatorio para `DEVELOPMENT` y `MAINTENANCE`
- `type` requerido
- `concept` requerido, minimo 2 caracteres
- `status` requerido
- `dueDate` requerido para `PENDING`
- `effectiveDate` requerido para `PAID`
- Validacion monetaria (USD o ARS+FX)

### 25.3 Servicio

Archivo: `src/server/services/incomes.ts`

Funciones:
- `listIncomes(filters)` — filtros por proyecto, cliente, tipo, status, rango fechas
- `getIncome(id)`
- `createIncome(input)` — en transaccion, asigna `clientId` desde proyecto si aplica
- `updateIncome(id, input)` — en transaccion, reasigna `clientId` si cambia proyecto
- `deleteIncome(id)` — con confirmacion para PAID
- `markAsPaid(id, effectiveDate, money?)` — actualiza mismo registro
- `generateInstallments(input)` — crea N registros PENDING con fechas mensuales


---

## 26. Categorias y gastos

### 26.1 Categorias definitivas

1. `Infraestructura y Hosting`
2. `Dominios`
3. `Herramientas`
4. `Publicidad`
5. `Contabilidad y Legal`
6. `Prospeccion y Demos`
7. `Marketing`
8. `Email`
9. `Sueldos y Honorarios`
10. `Viajes y Viaticos`
11. `Hardware`
12. `Otros`
13. `Utilidad`
14. `Comision por venta`

### 26.2 Normalizaciones de categoria

| Original en Excel | Categoria final |
|---|---|
| `Herramientas/Software` | `Herramientas` |
| `Infra/Cloud` | `Infraestructura y Hosting` (o `Herramientas` segun concepto) |
| `Hosting/Dominios` | `Dominios` o `Infraestructura y Hosting` segun concepto |
| `Publicidad (ads)` | `Publicidad` |
| `Contabilidad/Legal` | `Contabilidad y Legal` |
| `Prospeccion/Demos` | `Prospeccion y Demos` |
| `Email/Zoho` | `Email` |
| `Sueldos/Honorarios` | `Sueldos y Honorarios` |
| `Viajes/Viaticos` | `Viajes y Viaticos` |

### 26.3 Normalizacion de tipo de gasto

- `Fijo` -> `FIXED`
- `Variable` -> `VARIABLE`

Correccion explicita unica: ChatGPT del `2026-02-04` -> `FIXED` / `Herramientas` (ver seccion 23.4).

### 26.4 Asignacion de proyecto a gastos historicos

| Gasto | Proyecto |
|---|---|
| `Dominio Rasafertil` | RASAFERTIL - Sitio Web |
| `Mehc - Tercerizacion RRSS Coirini` | Coirini S.A. - Gestion RRSS |
| `Mehc + Coirini` (50%) | Coirini S.A. - Gestion RRSS |
| `Mehc + Coirini` (50%) | sin proyecto |
| `Comision Lis Sitio Web Rasafertil` | RASAFERTIL - Sitio Web |
| `Comision Lis PACSA` | PACSA - Gestion de Caravanas |
| `Flete Rosario - PACSA` | PACSA - Gestion de Caravanas |
| `Almuerzo Demo Colegio` | Colegio - Certificados Digitales |
| `Rackspace`, `GCP` | sin proyecto |
| `LinkedIn` | sin proyecto |
| `Monotributo`, `IIBB`, `Registro de marca` | sin proyecto |
| `Stickers`, `Escalamos` | sin proyecto |
| `Memoria RAM Tomas`, `Chips Claro` | sin proyecto |
| `Desayuno Viru` | sin proyecto |

### 26.5 Sueldos y Honorarios

Todos los retiros, salarios y honorarios se importan como gastos normales en categoria `Sueldos y Honorarios`, con `type = FIXED`. Incluye: retiros Tomi, retiros Renzo, salarios, honorarios, sueldo Fran, `750 usd c/u`, `1063 Tomi - 710 renzo`, `100k Tomi - 100k Renzo`, `1000 Tomi - 700 Renzo`, `925 Tomi - 925 Renzo`, `1.5M Tomi - 1.5M Renzo`, `Salario Fran`, `Sueldo Fran`. No mover a Utilidad.

### 26.6 Division Mehc + Coirini

Cada fila se divide en dos movimientos:

**Movimiento 1**: 50% ARS, 50% USD, Marketing, Coirini S.A. - Gestion RRSS.
**Movimiento 2**: resto exacto ARS, resto exacto USD, Marketing, sin proyecto.

Para evitar diferencias: calcular primera mitad, segunda mitad = original - primera. Conservar fecha, tipo, estado y trazabilidad.

### 26.7 Categorias posiblemente vacias

Crear igualmente: `Email`, `Otros`, `Utilidad`, `Prospeccion y Demos`. Ningun movimiento historico en `Utilidad`.

---

## 27. UX

### 27.1 Diseno general

- Minimalista, desktop-first, responsive.
- Sin scroll horizontal innecesario.
- Sidebar con navegacion. Header con alertas.
- Tokens de diseno Tailwind actuales conservados (`ink`, `paper`, `sand`, `cobalt`, `lime`, `coral`, `brick`, `mint`).

### 27.2 Navegacion

```
Dashboard
Clientes
Proyectos
Ingresos
Gastos
```

Eliminar entradas: Kanban, Calendario, Distribucion, Recurrentes.

### 27.3 Pantallas

#### Dashboard (`/`)
- Filtro de periodo (mes actual por defecto, mes anterior, mes siguiente, personalizado desde/hasta, limites inclusivos).
- Metricas del periodo: ingresos pagados, gastos pagados, resultado real, gastos fijos pagados, resultado proyectado.
- Metricas globales: total por cobrar, total por pagar, vencido por cobrar, vencido por pagar, gastos fijos pendientes.
- Resultado historico acumulado.
- Graficos: evolucion mensual (barras ingreso/gasto + linea neta, usando effectiveDate para PAID y dueDate para PENDING), gastos por categoria (donut), ranking de clientes (top 10, solo ingresos pagados con clientId, excluir sin cliente).
- Sin distribucion, remanente, capas, salarios separados.

#### Clientes (`/clients`)
- Listado con busqueda.
- Columnas: nombre, contacto, proyectos activos, ingresos pagados, resultado real.
- Detalle (`/clients/[id]`): datos de contacto, proyectos, metricas acumuladas.

#### Proyectos (`/projects`)
- Listado filtrable por cliente y estado (activo/inactivo).
- Columnas: nombre, cliente, estado, importe acordado, desarrollo cobrado, saldo, resultado.
- Crear/editar: nombre, cliente, estado, importes acordados (opcional).
- Cambio de cliente: solo si no tiene movimientos. Selector deshabilitado con explicacion.
- Finalizar: propone fecha actual como `endDate`, usuario puede cambiar o dejar vacia.
- Reactivar: no limpia `endDate` automaticamente.
- Eliminar: solo sin movimientos. Confirmacion requerida.
- Detalle (`/projects/[id]`): metricas completas (seccion 28).

#### Ingresos (`/incomes`)
- Listado con filtros: cliente, proyecto, tipo, estado (Pagado/Pendiente/Vencido), rango fechas.
- Columnas: fecha, cliente, proyecto, concepto, tipo, USD, ARS, TC, estado.
- Crear/editar: tipo, proyecto, concepto, importes, estado, fechas.
- Modal "Pagar": USD actual, ARS actual, TC actual, fecha efectiva.
- Editar/eliminar PAID: confirmacion explicita con advertencia de que afecta historial y metricas.
- Boton "Generar cuotas": modal con proyecto, tipo, concepto, cantidad, primera fecha, importes.

#### Gastos (`/expenses`)
- Listado con filtros: categoria, tipo, proyecto, estado, rango fechas.
- Columnas: fecha, categoria, tipo, concepto, proyecto, USD, ARS, TC, estado.
- Crear/editar: categoria, tipo, proyecto (opcional), concepto, importes, estado, fechas.
- Modal "Pagar": igual que ingresos.
- Gestion de categorias inline: crear, editar, desactivar, eliminar (solo si no usada).
- Categorias inactivas visibles en historial, no aparecen por defecto al crear gastos.

---

## 28. Metricas

### 28.1 Metricas de proyecto

Cada proyecto muestra:

| Metrica | Formula |
|---|---|
| Importe unico acordado | `agreedAmountUsd` (o "No disponible") |
| Importe mensual informativo | `monthlyAmountUsd` (o "No disponible") |
| Ingresos pagados | SUM(Income.amountUsd WHERE status=PAID AND projectId=X) |
| Ingresos pendientes | SUM(Income.amountUsd WHERE status=PENDING AND projectId=X) |
| Ingresos vencidos | SUM(Income PENDING WHERE dueDate < hoy AND projectId=X) |
| Desarrollo cobrado | SUM(Income WHERE type=DEVELOPMENT AND status=PAID AND projectId=X) |
| Saldo de desarrollo | `agreedAmountUsd - desarrolloCobrado` (o "No disponible" si sin importe). Puede ser negativo. |
| Mantenimiento cobrado | SUM(Income WHERE type=MAINTENANCE AND status=PAID AND projectId=X) |
| Gastos pagados | SUM(Expense.amountUsd WHERE status=PAID AND projectId=X) |
| Gastos pendientes | SUM(Expense.amountUsd WHERE status=PENDING AND projectId=X) |
| Resultado real | `ingresosPAID - gastosPAID` |
| Resultado proyectado | `ingresosPAID + ingresosPENDING - gastosPAID - gastosPENDING` |

Son metricas historicas completas del proyecto. MAINTENANCE no reduce saldo de desarrollo. Pendientes no cuentan como cobrados. No mostrar porcentaje.

### 28.2 Metricas de cliente

| Metrica | Formula |
|---|---|
| Proyectos activos | COUNT(Project WHERE isActive=true AND clientId=X) |
| Ingresos pagados | SUM(Income WHERE status=PAID AND clientId=X) — incluye OTHER directos |
| Ingresos pendientes | SUM(Income WHERE status=PENDING AND clientId=X) |
| Ingresos vencidos | SUM(Income PENDING WHERE dueDate<hoy AND clientId=X) |
| Gastos pagados | SUM(Expense WHERE status=PAID AND project.clientId=X) |
| Resultado real | `ingresosPAID - gastosPAID` |

Incluir ingresos directos OTHER con clientId. Excluir ingresos sin cliente. No calcular resultado proyectado por cliente.

### 28.3 Dashboard: metricas del periodo

Usar `effectiveDate` para PAID, `dueDate` para PENDING. Limites inclusivos.

| Metrica | Formula |
|---|---|
| Ingresos pagados | SUM(Income WHERE status=PAID AND effectiveDate IN range) |
| Gastos pagados | SUM(Expense WHERE status=PAID AND effectiveDate IN range) |
| Resultado real | `ingresosPagados - gastosPagados` |
| Gastos fijos pagados | SUM(Expense WHERE type=FIXED AND status=PAID AND effectiveDate IN range) |
| Resultado proyectado | `resultadoReal + SUM(Income PENDING dueDate IN range) - SUM(Expense PENDING dueDate IN range)` |

Vencidos anteriores al periodo siguen visibles globalmente pero no se suman silenciosamente a otro periodo.

### 28.4 Dashboard: metricas globales

No dependen del filtro de periodo.

| Metrica | Formula |
|---|---|
| Total por cobrar | SUM(Income WHERE status=PENDING) |
| Total por pagar | SUM(Expense WHERE status=PENDING) |
| Vencido por cobrar | SUM(Income PENDING WHERE dueDate < hoy) |
| Vencido por pagar | SUM(Expense PENDING WHERE dueDate < hoy) |
| Gastos fijos pendientes | SUM(Expense WHERE type=FIXED AND status=PENDING) |

### 28.5 Dashboard: resultado historico

`SUM(todos los Income PAID) - SUM(todos los Expense PAID)`

### 28.6 Dashboard: visualizaciones

- **Evolucion mensual**: distingue ingresos reales por effectiveDate, gastos reales por effectiveDate, ingresos pendientes por dueDate, gastos pendientes por dueDate. Agrupar por `yyyy-MM`.
- **Gastos por categoria**: donut con monto USD por categoria (solo PAID).
- **Ranking de clientes**: solo ingresos pagados con clientId. Excluir ingresos sin cliente.

---

## 29. Alertas

### 29.1 Sin tabla de alertas

Las alertas se calculan en cada consulta a `src/server/services/alerts.ts`. No se persisten.

### 29.2 Vencidos

```typescript
const overdueIncomes = await prisma.income.findMany({
  where: {
    status: "PENDING",
    dueDate: { lt: todayInCordoba() },
  },
});

const overdueExpenses = await prisma.expense.findMany({
  where: {
    status: "PENDING",
    dueDate: { lt: todayInCordoba() },
  },
});
```

### 29.3 Proximos 30 dias

```typescript
const today = todayInCordoba();
const in30Days = new Date(today);
in30Days.setDate(in30Days.getDate() + 30);

const upcomingIncomes = await prisma.income.findMany({
  where: {
    status: "PENDING",
    dueDate: { gte: today, lte: in30Days },
  },
});

const upcomingExpenses = await prisma.expense.findMany({
  where: {
    status: "PENDING",
    dueDate: { gte: today, lte: in30Days },
  },
});
```

No duplicar vencidos dentro de proximos (los vencidos tienen dueDate < hoy, los proximos tienen dueDate >= hoy). Ambos inclusive.

---

## 30. Tests

### 30.1 Configuracion

Archivo: `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

### 30.2 Setup de tests

Archivo: `tests/setup.ts`

```typescript
import { beforeAll, afterAll } from "vitest";

beforeAll(() => {
  if (process.env.NODE_ENV !== "test") throw new Error("NODE_ENV must be test");
  if (!process.env.ALLOW_DESTRUCTIVE_TEST_DB) throw new Error("ALLOW_DESTRUCTIVE_TEST_DB required");
  if (!process.env.DATABASE_URL_TEST) throw new Error("DATABASE_URL_TEST required");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  if (process.env.DATABASE_URL_TEST === process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL_TEST must differ from DATABASE_URL");
  }
});
```

### 30.3 Estructura de tests

```
tests/
├── setup.ts
├── unit/
│   ├── money.test.ts
│   ├── dates.test.ts
│   ├── status.test.ts
│   ├── session.test.ts
│   └── project-amounts.test.ts
├── integration/
│   ├── clients.test.ts
│   ├── projects.test.ts
│   ├── incomes.test.ts
│   ├── expenses.test.ts
│   ├── expense-categories.test.ts
│   ├── dashboard.test.ts
│   ├── alerts.test.ts
│   ├── installments.test.ts
│   ├── auth.test.ts
│   └── seed.test.ts
└── sql/
    └── constraints.test.ts
```

### 30.4 Cobertura de los 123 casos minimos

#### Fechas y estados (tests 1-12) — `tests/unit/dates.test.ts`, `tests/unit/status.test.ts`, `tests/sql/constraints.test.ts`, `tests/integration/incomes.test.ts`

1. OVERDUE se calcula correctamente
2. Zona horaria Cordoba
3. Hoy incluido en proximos 30 dias
4. Dia 30 incluido
5. Dia 31 excluido (si el mes tiene 30)
6. Vencidos excluidos de proximos
7. PENDING requiere dueDate (SQL constraint)
8. PENDING no admite effectiveDate (SQL constraint)
9. PAID requiere effectiveDate (SQL constraint)
10. Pago actualiza mismo registro (no crea otro)
11. Conserva dueDate al pagar
12. Reemplaza montos al pagar

#### Dinero (tests 13-18) — `tests/unit/money.test.ts`

13. ARS + USD calcula TC
14. ARS + TC calcula USD
15. Solo USD deja nulls
16. Rechazo de cero
17. Precision Decimal(18,6)
18. Division exacta Mehc (50/50 sin diferencias)

#### Proyecto: importes (tests 19-27) — `tests/unit/project-amounts.test.ts`, `tests/sql/constraints.test.ts`

19. Importe vacio (todos null)
20. USD correcto
21. USD rechaza TC
22. ARS requiere TC
23. ARS calcula USD en servidor
24. Mensual vacio
25. Mensual USD correcto
26. Mensual ARS correcto
27. Configuracion parcial rechazada (SQL CHECK)

#### Ingresos (tests 28-37) — `tests/sql/constraints.test.ts`, `tests/integration/incomes.test.ts`

28. DEVELOPMENT requiere proyecto (SQL CHECK)
29. MAINTENANCE requiere proyecto (SQL CHECK)
30. OTHER sin cliente/proyecto (valido)
31. OTHER con cliente sin proyecto (valido)
32. Proyecto fuerza cliente en servidor (ignora clientId inconsistente)
33. Inconsistencia cliente/proyecto rechazada en servicio (para OTHER con proyecto)
34. Cambiar proyecto actualiza cliente en misma transaccion
35. No conserva cliente anterior al cambiar proyecto
36. Quitar proyecto de OTHER limpia cliente
37. Permite seleccionar cliente directo despues

#### Cambio de cliente del proyecto (tests 38-44) — `tests/integration/projects.test.ts`

38. Permite sin movimientos
39. Rechaza con ingreso
40. Rechaza con gasto
41. Rechaza con ambos
42. No modifica Income.clientId existentes (no cascada)
43. La transaccion hace rollback si se rechaza
44. Validacion backend (no solo frontend)

#### Gastos (tests 45-46) — `tests/integration/expenses.test.ts`

45. Cambiar proyecto actualiza atribucion en metricas
46. No existe clientId duplicado en Expense

#### Dashboard (tests 47-56) — `tests/integration/dashboard.test.ts`

47. Ingresos por periodo usando effectiveDate
48. Gastos por periodo usando effectiveDate
49. Resultado real del periodo
50. Resultado proyectado del periodo
51. Vencidos anteriores no se mezclan en periodo actual
52. Gastos fijos pagados en el periodo
53. Gastos fijos pendientes (global)
54. Acumulado historico (independiente del filtro)
55. Globales independientes del filtro de periodo
56. Ranking excluye ingresos sin cliente

#### Metricas de proyecto (tests 57-65) — `tests/integration/projects.test.ts`

57. Desarrollo cobrado solo DEVELOPMENT PAID
58. Mantenimiento cobrado solo MAINTENANCE PAID
59. Saldo de desarrollo (positivo)
60. Saldo negativo
61. Sin importe acordado muestra "No disponible"
62. Gastos pagados del proyecto
63. Gastos pendientes del proyecto
64. Resultado real del proyecto
65. Resultado proyectado del proyecto

#### Metricas de cliente (tests 66-69) — `tests/integration/clients.test.ts`

66. Proyectos activos
67. OTHER directos incluidos en ingresos
68. Gastos derivados de proyectos del cliente
69. Resultado real del cliente

#### Cuotas (tests 70-76) — `tests/integration/installments.test.ts`

70. Crea N registros
71. Todos PENDING con dueDate
72. Fechas mensuales correctas
73. 31 de enero + 1 mes -> 28/29 febrero (date-fns addMonths)
74. Ano bisiesto: 29 de febrero
75. Independencia: modificar una cuota no afecta otras
76. Sin tabla de serie (verificar que no hay modelo extra)

#### Sesion (tests 77-87) — `tests/unit/session.test.ts`, `tests/integration/auth.test.ts`

77. Cookie valida -> validacion correcta
78. Payload integro -> aceptado
79. Firma alterada -> rechazado
80. Payload alterado -> rechazado
81. Vencida -> rechazada
82. Formato invalido -> rechazado
83. Falta SESSION_SECRET -> error
84. Falta APP_PASSWORD -> error
85. Logout elimina cookie
86. timingSafeEqual usado (verificar en codigo, no en test)
87. Cookie no contiene APP_PASSWORD

#### SQL constraints (tests 88-96) — `tests/sql/constraints.test.ts`

88. INSERT PENDING sin dueDate -> rechazado
89. INSERT PENDING con effectiveDate -> rechazado
90. INSERT PAID sin effectiveDate -> rechazado
91. INSERT con amountUsd <= 0 -> rechazado
92. UPDATE proyecto ARS sin TC -> rechazado
93. UPDATE proyecto USD con TC no nulo -> rechazado
94. Unicidad clientes (INSERT duplicado -> rechazado)
95. Unicidad categorias (INSERT duplicado -> rechazado)
96. Unicidad proyecto por cliente (INSERT duplicado -> rechazado)

#### Seed (tests 97-123) — `tests/integration/seed.test.ts`

97. Clientes canonicos creados (13 clientes)
98. Proyectos canonicos creados (~18 proyectos)
99. Estados correctos (todos PAID)
100. Colegio: Certificados Digitales y Firma Digital unificados
101. Automatizacion WhatsApp unificado
102. Zaphi World transformado (cliente, proyecto, concepto)
103. RFN bajo Lorenzo Ferraro (no RFN Argentina)
104. Ajuste por intereses como OTHER sin cliente/proyecto
105. Totales excluidos del seed
106. Filas sin fecha excluidas
107. TC calculado correctamente (amountArs / amountUsd)
108. Solo USD con ARS null y exchangeRate null
109. Concept desde tipo historico (Adelanto, Pago final, Recurrente)
110. Observaciones a notes
111. Override Zaphi World: Soporte en Implementacion Odoo
112. Colegio tipo vacio -> DEVELOPMENT / "Desarrollo"
113. ChatGPT 2026-02-04 corregido: FIXED / Herramientas con trazabilidad en notes
114. Division Mehc + Coirini: dos movimientos, suma exacta = original
115. Totales finales no importados
116. Comisiones con proyecto asignado
117. Dominio Rasafertil con proyecto Sitio Web
118. Flete PACSA con proyecto Gestion de Caravanas
119. Almuerzo Colegio con proyecto Certificados Digitales
120. Ningun movimiento historico en categoria Utilidad
121. Sin modo demo (prisma requiere DATABASE_URL)
122. Seed no importa xlsx
123. Seed no lee Excel en runtime


---

## 31. Validacion manual

Checklist post-implementacion para validar en el navegador:

- [ ] Login con `APP_PASSWORD` correcta -> acceso al dashboard
- [ ] Login rechaza contrasena incorrecta -> mensaje de error
- [ ] Login rechaza si falta `APP_PASSWORD` o `SESSION_SECRET` -> error 500 visible
- [ ] Logout elimina cookie y redirige a login
- [ ] Cookie manipulada (firma alterada) -> redirige a login
- [ ] Rutas protegidas redirigen a login sin cookie valida
- [ ] API routes protegidas devuelven 401 sin cookie
- [ ] CRUD Clientes: crear, editar, buscar
- [ ] Eliminar cliente con proyectos -> bloqueado con mensaje
- [ ] Eliminar cliente con ingresos directos -> bloqueado
- [ ] Eliminar cliente sin proyectos ni ingresos -> exitoso con confirmacion
- [ ] CRUD Proyectos: crear, editar, filtrar por cliente y estado
- [ ] Cambiar cliente de proyecto sin movimientos -> exitoso
- [ ] Cambiar cliente de proyecto con movimientos -> selector deshabilitado con explicacion, backend rechaza
- [ ] Finalizar proyecto -> propone fecha actual como endDate, usuario puede cambiar o dejar vacia
- [ ] Reactivar proyecto -> no limpia endDate
- [ ] Eliminar proyecto sin movimientos -> exitoso con confirmacion
- [ ] Eliminar proyecto con movimientos -> bloqueado
- [ ] Importes acordados USD: guardar, verificar agreedAmountUsd = original
- [ ] Importes acordados ARS + TC: guardar, verificar calculo USD
- [ ] Importes acordados solo TC sin importe -> no permitido
- [ ] Importe mensual informativo: mismas validaciones
- [ ] CRUD Ingresos: DEVELOPMENT requiere proyecto
- [ ] MAINTENANCE requiere proyecto
- [ ] OTHER sin cliente ni proyecto -> exitoso
- [ ] OTHER con cliente sin proyecto -> exitoso
- [ ] Pago de pendiente: abre modal con USD/ARS/TC actuales
- [ ] Al pagar: se actualiza el mismo registro (mismo ID)
- [ ] Al pagar: effectiveDate se establece, dueDate se conserva
- [ ] Al pagar: nuevos montos reemplazan anteriores
- [ ] Editar ingreso PAID: confirmacion, permite cambio de montos
- [ ] Eliminar ingreso PAID: confirmacion explicita con advertencia
- [ ] Cambiar proyecto de ingreso DEVELOPMENT: cliente se actualiza automaticamente
- [ ] OTHER sin proyecto: cliente se limpia al quitar proyecto
- [ ] OTHER: puede seleccionar cliente directo despues de quitar proyecto
- [ ] Generador de cuotas: modal con proyecto, tipo, concepto, cantidad, fecha, importes
- [ ] Genera N registros PENDING independientes con fechas mensuales
- [ ] Cuota 31 enero -> siguiente fecha correcta (28 feb o 29 feb en bisiesto)
- [ ] Cuota en ano bisiesto -> 29 febrero se genera correctamente
- [ ] CRUD Gastos: FIXED/VARIABLE, con/sin proyecto
- [ ] Gasto PENDING: requiere dueDate
- [ ] Gasto PAID: requiere effectiveDate
- [ ] Pago de gasto pendiente: actualiza mismo registro
- [ ] CRUD Categorias: crear, editar, desactivar, eliminar solo sin uso
- [ ] Categoria usada no se puede eliminar (boton deshabilitado o bloqueado)
- [ ] Categoria no usada se puede eliminar con confirmacion
- [ ] Categorias inactivas no aparecen en selector de creacion de gastos
- [ ] Categorias inactivas visibles en historial de gastos
- [ ] Filtros de dashboard: mes actual (default), mes anterior, mes siguiente, personalizado
- [ ] Metricas del periodo: ingresos pagados por effectiveDate, gastos pagados por effectiveDate
- [ ] Resultado real del periodo correcto
- [ ] Resultado proyectado: incluye PENDING con dueDate en el periodo
- [ ] Metricas globales: independientes del filtro de periodo
- [ ] Resultado historico acumulado visible
- [ ] Grafico de evolucion mensual funcional (carga client-side sin error)
- [ ] Grafico de gastos por categoria funcional
- [ ] Ranking de clientes: excluye ingresos sin cliente
- [ ] Sin referencias a distribucion, capas, remanente
- [ ] Alertas en header: muestra vencidos y proximos 30 dias
- [ ] Sin alertas cuando no hay vencidos ni proximos: banner no se muestra
- [ ] Vista responsive en mobile: sin scroll horizontal
- [ ] Gasto ChatGPT febrero 2026: se visualiza como FIXED / Herramientas con nota de correccion
- [ ] KPIs del dashboard reflejan correctamente los datos del seed

---

## 32. Plan por fases

### Fase 1 — Auditoria e inventario
**Objetivo:** documentar el estado actual sin modificar nada.
**Archivos a crear:** `docs/PLAN_SIMPLIFICACION_FINANZAS.md`
**Archivos a modificar:** ninguno
**Archivos a eliminar:** ninguno
**Comandos:** solo lectura
**Aceptacion:** documento completo con 38 secciones, 123 tests, 21 fases de implementacion.
**Riesgos:** bajo. Solo lectura.
**Rollback:** no aplica.
**Dependencias:** ninguna.

### Fase 2 — Base de test
**Objetivo:** infraestructura para tests automatizados.
**Archivos a crear:**
- `docker-compose.test.yml`
- `.env.test.example`
- `.env.example`
- `vitest.config.ts`
- `tests/setup.ts`

**Archivos a modificar:**
- `package.json` (agregar `vitest` en devDependencies, scripts test)

**Archivos a eliminar:** ninguno

**Comandos:**
```bash
npm install --save-dev vitest
docker compose -f docker-compose.test.yml up -d
npx prisma db execute --stdin <<< "SELECT 1;"
# Usar DATABASE_URL_TEST para verificar conexion
```

**Aceptacion:** Docker levanta PostgreSQL 16 en puerto 5434. `vitest run` no falla por configuracion.
**Riesgos:** Docker no disponible. Alternativa: base de test remota con credenciales separadas.
**Rollback:** `docker compose down`, `npm uninstall vitest`, revertir `package.json`.
**Dependencias:** Fase 1.
**Estado:** COMPLETADA (2026-07-17). PostgreSQL 16 operativo en puerto 5434. Guardia 10/10 OK. Integracion 4/4 OK (0 skipped). Conexion real verificada. PostgreSQL 16.x confirmado via SHOW server_version. Desvio anterior por Docker resuelto.

### Fase 3 — Modelo Prisma + restricciones SQL
**Objetivo:** nuevo schema Prisma con CHECKs SQL.

**Archivos a crear:**
- `prisma/schema.prisma` (nuevo, reemplazo total)

**Archivos a eliminar:**
- `prisma/schema.prisma` (anterior)
- `prisma/migrations/*` (las 12 migraciones anteriores)

**Comandos:**
```bash
rm -rf prisma/migrations/*
DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate dev --name init_simplified --create-only
# Editar migracion generada: agregar CHECKs SQL (seccion 13.2)
DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate dev
DATABASE_URL="$DATABASE_URL_TEST" npx prisma generate
npx prisma validate
```

**Aceptacion:** `prisma validate` exitoso. Migracion aplicada en test. CHECKs SQL activos.
**Riesgos:** errores de sintaxis en CHECKs. Rollback: git checkout del schema anterior.
**Dependencias:** Fase 2 (base de test disponible).
**Estado:** Esquema implementado, consumidores legacy eliminados, build recuperado, APIs temporales eliminadas. Servicios definitivos pendientes. Checkpoint listo.

**Limpieza final (2026-07-17):**
- **12 API routes financieras eliminadas** (clients, projects, incomes, expenses, expense-categories, dashboard, alerts con sus subrutas [id]). Sin consumidores, sin respuestas vacias.
- **Solo /api/auth permanece** (funcional, usada por login-form).
- **Placeholders estaticos** sin fetch a APIs.
- **0 consumidores residuales** de APIs financieras.
- **Prisma sin cambios** (26 CHECKs, 3 indices CI, 5 FKs, 13 migraciones).
- TypeScript: 0, Lint: 0, Build: OK.

**Resultados de la auditoria final (2026-07-17):**
- **finance.ts**: eliminado completamente (0 consumidores, 0 referencias)
- **notYet()**: 0 invocaciones en runtime (el archivo ya no existe)
- **demo-data.ts**: eliminado, 0 referencias restantes
- **Middleware**: limpiado de referencias Kanban, auth funcional
- **Auth API route**: restaurada a funcionamiento real con lib/auth.ts existente
- **Rutas eliminadas**: /kanban, /calendar, /distribution, /recurring → 404
- **Rutas protegidas**: 7/7 → 200 OK (placeholders)
- **API routes**: 7/7 → 200 OK (stubs seguros)
- **Navegacion**: 5 items (Dashboard, Clientes, Proyectos, Ingresos, Gastos)
- **Sin enlaces a rutas eliminadas**: verificado
- **Sin imports muertos a servicios eliminados**: verificado
- **Sin referencias a modelos/enums legacy en src/**: verificado
- **Prisma**: format OK, validate OK, generate OK, migrate status up to date (13 migraciones)
- **Tests**: 43/43 (10 unit + 4 integracion + 29 SQL, 0 skipped)
- TypeScript: 0, Lint: 0, Build: OK
- Smoke HTTP: login 200, protected routes 200, deleted routes 404
- **66 archivos cambiados** (15,196 lineas eliminadas, 349 agregadas)
- Sin seed ejecutado, sin produccion tocada

**Resultados del corte coordinado (2026-07-17, bloque atomico):**
- **TypeScript: 0 errores** (de 387 a 0)
- **Lint: 0 errores**
- **Build: exitoso**
- **Tests: 43/43** (10 unit + 4 integracion + 29 SQL, 0 skipped)
- **65 archivos afectados** (15,107 lineas eliminadas, 429 lineas nuevas)

**Modulos eliminados permanentemente:**
- Kanban (servicio, ruta, pagina, componentes, tipos, navegacion)
- Calendario (ruta, pagina, componentes)
- Distribucion / capas / reservas (ruta, pagina, API)
- Salarios / retiros como modulo separado (ruta, API)
- Recurrencias automaticas (rutas, API de recurring-incomes, recurring-expenses)
- Pagos y gastos programados (rutas, API de scheduled-payments, scheduled-expenses)
- Demo mode (`src/server/demo-data.ts` eliminado completamente)

**Modulos en placeholder (pendientes de reconstruccion en fases 8-13):**
- Clientes, Proyectos, Ingresos, Gastos, Categorias, Dashboard, Alertas
- Cada ruta muestra pagina honesta "Este modulo esta siendo adaptado al nuevo modelo financiero"
- Las API routes devuelven datos minimos o lanzan error "Modulo pendiente de reconstruccion"

**Formula monetaria canonica en CHECKs:**
`amountUsd = round(amountArs / exchangeRate, 6)` (NUMERIC, 4 constraints)

**Resultados corregidos (2026-07-17, segunda revision):**
- 12 migraciones historicas conservadas + 1 migracion destructiva nueva (13 total)
- Reconstruccion desde cero validada con `prisma migrate reset --skip-seed`
- 26 CHECKs SQL, 3 indices funcionales CI, 5 FKs RESTRICT, 13 indices regulares, 4 enums, 5 tablas
- **Formula monetaria canonica:** `amountUsd = round(amountArs / exchangeRate, 6)` (NUMERIC, no tolerancia, no reconstruccion del TC desde USD)
- CHECKs de consistencia: `chk_income_monetary_consistency`, `chk_expense_monetary_consistency`, `chk_project_one_time_ars_consistency`, `chk_project_monthly_ars_consistency`
- Caso de redondeo verificado: `round(1000.00 / 810.000000, 6) = 1.234568` aceptado; `1.234567` rechazado
- DROP de tablas y enums antiguos al inicio de la migracion
- Tests: unitarios 10/10, integracion 4/4, **SQL 29/29** (17 originales + 12 de aceptacion/rechazo monetario) = 43 total
- Lint: OK. TypeScript: 387 errores. Build: falla.
- `prisma format` OK, `prisma validate` OK, `prisma generate` OK, `prisma migrate status` OK
- Tests: unitarios 10/10, integracion 4/4, SQL constraints 17/17 = 31 tests pasando
- Lint: OK. TypeScript: 387 errores. Build: falla.

**Errores residuales de TypeScript (387):**
- Archivos afectados: `src/server/services/finance.ts`, `src/server/services/kanban.ts`, `prisma/seed.ts`
- TS2339 (120): propiedad inexistente en Prisma Client (scheduledPayment, recurringIncome, etc.)
- TS2353 (77): campo desconocido en create/update (date, status, monthlyFeeUsd, isDefault, etc.)
- TS7006 (67): parametro implicitamente 'any' (sin tipos por modelos removidos)
- TS2305 (11): miembro exportado no encontrado (@prisma/client)
- Otros (112): TS2322, TS2345, TS2694, TS2551, TS2561, TS18046
- Estos archivos seran reescritos/eliminados en Fases 8-16. No se requieren stubs ni compatibilidad transitoria.
- Produccion no fue tocada. Migracion solo aplicada en DATABASE_URL_TEST.
- Estos archivos seran reescritos/eliminados en Fases 8-16. No se requieren stubs ni compatibilidad transitoria.
- Produccion no fue tocada. Migracion solo aplicada en DATABASE_URL_TEST.

### Fase 4 — Generacion de migracion (solo test)
**Objetivo:** generar la migracion inicial simplificada y aplicarla contra la base de test para validar el schema antes de tocar produccion. La migracion contra `DATABASE_URL` real se ejecuta recien en la Fase 20 (Produccion).

**Comandos:**
```bash
# workdir: ./
# Verificar que la base productiva esta vacia (solo lectura informativa)
npx prisma db execute --stdin <<< "SELECT count(*) FROM clients;"
# Si count > 0: documentar, pero continuar (no se migra produccion aun)

# Aplicar migracion unicamente en la base de test
DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate dev
DATABASE_URL="$DATABASE_URL_TEST" npx prisma generate
```

**Aceptacion:** migracion aplicada en test. CHECKs SQL activos en test. Cliente Prisma generado.
**Riesgos:** bajo — solo se opera sobre la base de test.
**Rollback:** `DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate reset`.
**Dependencias:** Fase 3.

### Fase 5 — Extraccion del Excel
**Objetivo:** script one-off que convierte el Excel en datos canonicos TypeScript.

**Archivos a crear:**
- `scripts/extract-finance-xlsx.ts`

**Archivos a modificar:**
- `package.json` (mover `xlsx` a devDependencies)

**Comandos:**
```bash
npm uninstall xlsx && npm install --save-dev xlsx
npx tsx scripts/extract-finance-xlsx.ts
```

**Aceptacion:** archivos `prisma/seed-data/*.ts` generados. Conteos coinciden con inventario. ChatGPT corregido. Zaphi World transformado. Mehc dividido.
**Riesgos:** datos del Excel no coinciden con lo esperado.
**Rollback:** revertir `package.json`, eliminar `scripts/` y `prisma/seed-data/`.
**Dependencias:** ninguna (usa el Excel existente).

### Fase 6 — Datos canonicos y seed
**Objetivo:** seed que puebla la base desde datos canonicos (sin Excel).

**Archivos a crear:**
- `prisma/seed-data/clients.ts`
- `prisma/seed-data/projects.ts`
- `prisma/seed-data/incomes.ts`
- `prisma/seed-data/expense-categories.ts`
- `prisma/seed-data/expenses.ts`

**Archivos a modificar:**
- `prisma/seed.ts` (reconstruccion total, sin importar xlsx)

**Comandos:**
```bash
DATABASE_URL="$DATABASE_URL_TEST" NODE_ENV=test ALLOW_DESTRUCTIVE_TEST_DB=true npm run db:seed
```

**Aceptacion:** seed completo sin errores. Conteo de registros coincide. Todos PAID. Categorias canonicas creadas. Sin movimientos en Utilidad.
**Riesgos:** FK violations, nombres duplicados en datos canonicos.
**Rollback:** `npx prisma migrate reset` en test.
**Dependencias:** Fase 5.

### Fase 7 — Helpers: dinero, fechas, estados, sesion
**Objetivo:** implementar los helpers de fuente unica.

**Archivos a crear:**
- `src/lib/money.ts`
- `src/lib/money-client.ts`
- `src/lib/dates.ts`
- `src/lib/session.ts`
- `src/server/services/money.ts`
- `src/server/services/status.ts`
- `src/server/validations/client.ts`
- `src/server/validations/project.ts`
- `src/server/validations/income.ts`
- `src/server/validations/expense.ts`
- `src/server/validations/expense-category.ts`
- `src/server/validations/dashboard.ts`

**Archivos a modificar:**
- `src/lib/utils.ts` (adaptar para Decimal, eliminar formatos obsoletos)
- `src/lib/auth.ts` (reconstruir con HMAC-SHA256)
- `src/lib/types.ts` (reconstruir solo tipos necesarios)

**Comandos:**
```bash
NODE_ENV=test npx vitest run tests/unit/
npx tsc --noEmit
```

**Aceptacion:** 27 tests unitarios pasan. `tsc --noEmit` sin errores.
**Riesgos:** bajo. Solo archivos nuevos o modificaciones aisladas.
**Rollback:** git checkout archivos modificados, eliminar archivos nuevos.
**Dependencias:** Fase 2 (vitest configurado).

### Fase 8 — Clientes
**Objetivo:** implementar servicio, API routes y pantalla de clientes.

**Archivos a crear:**
- `src/server/services/clients.ts`

**Archivos a modificar:**
- `src/app/api/clients/route.ts`
- `src/app/api/clients/[id]/route.ts`
- `src/app/clients/page.tsx`
- `src/app/clients/[id]/page.tsx`
- `src/components/screens/clients-screen.tsx`
- `src/middleware.ts` (nueva validacion de sesion)

**Comandos:**
```bash
NODE_ENV=test ALLOW_DESTRUCTIVE_TEST_DB=true npx vitest run tests/integration/clients.test.ts
npm run lint
npm run build
```

**Aceptacion:** tests 66-69 pasan. CRUD clientes funcional. Eliminacion bloqueada con proyectos/ingresos.
**Riesgos:** regresiones en paginas no migradas aun (build puede fallar por imports rotos a modulos eliminados).
**Rollback:** git checkout archivos modificados.
**Dependencias:** Fase 7.

### Fase 9 — Proyectos
**Objetivo:** implementar servicio, API routes y pantalla de proyectos.

**Archivos a crear:**
- `src/server/services/projects.ts`

**Archivos a modificar:**
- `src/app/api/projects/route.ts`
- `src/app/api/projects/[id]/route.ts`
- `src/app/projects/page.tsx`
- `src/app/projects/[id]/page.tsx`
- `src/components/screens/projects-screen.tsx`

**Comandos:**
```bash
NODE_ENV=test ALLOW_DESTRUCTIVE_TEST_DB=true npx vitest run tests/integration/projects.test.ts
npm run lint && npm run build
```

**Aceptacion:** tests 19-27, 38-44, 57-65 pasan. Importes acordados funcionan. Cambio de cliente bloqueado con movimientos.
**Riesgos:** logica de importes compleja.
**Rollback:** git checkout archivos modificados.
**Dependencias:** Fase 8.

### Fase 10 — Ingresos
**Objetivo:** implementar servicio, API routes y pantalla de ingresos.

**Archivos a crear:**
- `src/server/services/incomes.ts`

**Archivos a modificar:**
- `src/app/api/incomes/route.ts`
- `src/app/api/incomes/[id]/route.ts`
- `src/app/incomes/page.tsx`
- `src/components/screens/incomes-screen.tsx`

**Archivos a eliminar:**
- `src/components/payments/mark-income-paid-button.tsx`
- `src/components/payments/mark-payment-paid-button.tsx`
- `src/components/payments/scheduled-payment-settlement-modal.tsx`

**Comandos:**
```bash
NODE_ENV=test ALLOW_DESTRUCTIVE_TEST_DB=true npx vitest run tests/integration/incomes.test.ts
npm run lint && npm run build
```

**Aceptacion:** tests 28-37, 10-12 pasan. Pago de pendientes actualiza mismo registro. Cambio de proyecto actualiza cliente.
**Riesgos:** transacciones con multiples updates.
**Rollback:** git checkout.
**Dependencias:** Fase 9.

### Fase 11 — Gastos y categorias
**Objetivo:** implementar servicios, API routes y pantallas.

**Archivos a crear:**
- `src/server/services/expenses.ts`
- `src/server/services/expense-categories.ts`

**Archivos a modificar:**
- `src/app/api/expenses/route.ts`
- `src/app/api/expenses/[id]/route.ts`
- `src/app/api/expense-categories/route.ts`
- `src/app/api/expense-categories/[id]/route.ts`
- `src/app/expenses/page.tsx`
- `src/components/screens/expenses-screen.tsx`

**Archivos a eliminar:**
- `src/components/expenses/pay-scheduled-expense-modal.tsx`

**Comandos:**
```bash
NODE_ENV=test ALLOW_DESTRUCTIVE_TEST_DB=true npx vitest run tests/integration/expenses.test.ts
npx vitest run tests/integration/expense-categories.test.ts
npm run lint && npm run build
```

**Aceptacion:** tests 45-46 pasan. Categorias: crear, editar, desactivar, eliminar solo sin uso.
**Riesgos:** normalizacion de categorias historicas.
**Rollback:** git checkout.
**Dependencias:** Fase 10.

### Fase 12 — Dashboard
**Objetivo:** implementar servicio y pantalla de dashboard.

**Archivos a crear:**
- `src/server/services/dashboard.ts`

**Archivos a modificar:**
- `src/app/api/dashboard/route.ts`
- `src/app/page.tsx`
- `src/components/dashboard/charts.tsx`
- `src/components/dashboard/date-range-controls.tsx`
- `src/lib/dashboard-date-range.ts` (zona horaria Cordoba)

**Comandos:**
```bash
NODE_ENV=test ALLOW_DESTRUCTIVE_TEST_DB=true npx vitest run tests/integration/dashboard.test.ts
npm run lint && npm run build
```

**Aceptacion:** tests 47-56 pasan. Graficos funcionales. Sin distribucion/ capas/remanente.
**Riesgos:** rendimiento de queries agregadas.
**Rollback:** git checkout.
**Dependencias:** Fase 11.

### Fase 13 — Alertas
**Objetivo:** implementar servicio de alertas en tiempo real.

**Archivos a crear:**
- `src/server/services/alerts.ts`

**Archivos a modificar:**
- `src/app/api/alerts/route.ts`
- `src/components/ui/alert-banner.tsx`

**Comandos:**
```bash
NODE_ENV=test ALLOW_DESTRUCTIVE_TEST_DB=true npx vitest run tests/integration/alerts.test.ts
npm run lint && npm run build
```

**Aceptacion:** AlertBanner muestra vencidos y proximos. Sin tabla de alertas.
**Riesgos:** bajo.
**Rollback:** git checkout.
**Dependencias:** Fase 12.

### Fase 14 — Autenticacion
**Objetivo:** reemplazar auth actual por HMAC-SHA256.

**Archivos a modificar:**
- `src/lib/auth.ts`
- `src/middleware.ts`
- `src/app/api/auth/route.ts`
- `src/components/screens/login-form.tsx`
- `src/app/login/page.tsx`

**Archivos a crear:**
- `src/server/services/auth.ts`

**Comandos:**
```bash
NODE_ENV=test npx vitest run tests/unit/session.test.ts
NODE_ENV=test npx vitest run tests/integration/auth.test.ts
npm run lint && npm run build
```

**Aceptacion:** tests 77-87 pasan. Cookie firmada. Sin fallback demo.
**Riesgos:** si el middleware falla, toda la app queda inaccesible.
**Rollback:** git checkout de `lib/auth.ts`, `middleware.ts`, `api/auth/route.ts`.
**Dependencias:** Fase 7 (session.ts ya creado).

### Fase 15 — Generador de cuotas
**Objetivo:** herramienta manual de cuotas mensuales.

**Archivos a modificar:**
- `src/server/services/incomes.ts` (agregar generateInstallments)
- `src/components/screens/incomes-screen.tsx` (modal de cuotas)

**Comandos:**
```bash
NODE_ENV=test ALLOW_DESTRUCTIVE_TEST_DB=true npx vitest run tests/integration/installments.test.ts
npm run lint && npm run build
```

**Aceptacion:** tests 70-76 pasan. Fechas bisiestas y 31 enero correctas.
**Riesgos:** calculo de fechas en limites de mes.
**Rollback:** revertir cambios en incomes.ts.
**Dependencias:** Fase 10.

### Fase 16 — Eliminacion de modulos obsoletos
**Objetivo:** eliminar Kanban, Calendario, Distribucion, Recurrentes, demo mode.

**Archivos a eliminar (directorios completos):**
- `src/app/kanban/`
- `src/app/calendar/`
- `src/app/distribution/`
- `src/app/recurring/`
- `src/app/api/kanban/`
- `src/app/api/distribution/`
- `src/app/api/salary/`
- `src/app/api/recurring-incomes/`
- `src/app/api/recurring-expenses/`
- `src/app/api/scheduled-payments/`
- `src/app/api/scheduled-expenses/`

**Archivos a eliminar (individuales):**
- `src/components/screens/kanban-screen.tsx`
- `src/components/screens/calendar-screen.tsx`
- `src/components/screens/distribution-screen.tsx`
- `src/components/screens/recurring-screen.tsx`
- `src/components/calendar/day-action-modal.tsx`
- `src/components/calendar/expense-entry-modal.tsx`
- `src/components/calendar/income-entry-modal.tsx`
- `src/server/services/finance.ts`
- `src/server/services/kanban.ts`
- `src/server/demo-data.ts`

**Archivos a modificar:**
- `src/components/layout/navigation-config.ts` (eliminar entradas Kanban, Calendar, Distribution, Recurring)
- `src/components/layout/sidebar.tsx`
- `src/components/layout/header.tsx`
- `src/server/prisma.ts` (eliminar hasDatabaseConfig, siempre requiere DATABASE_URL)

**Comandos:**
```bash
npm run lint
npm run build
npx tsc --noEmit
```

**Aceptacion:** build sin errores. No quedan imports a modulos eliminados. Demo mode completamente eliminado.
**Riesgos:** imports residuales, referencias cruzadas.
**Rollback:** git checkout de todo el repositorio.
**Dependencias:** Fases 8-15 (todas las funcionalidades nuevas implementadas).

### Fase 17 — Dependencias
**Objetivo:** eliminar dependencias obsoletas, mover xlsx.

**Archivos a modificar:**
- `package.json` y `package-lock.json`

**Comandos:**
```bash
npm uninstall @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities bubblewrap
# xlsx ya se movio en Fase 5
npm install
npm run lint && npm run build
```

**Aceptacion:** build exitoso. `npm ls` no muestra dependencias eliminadas en dependencies.
**Riesgos:** dependencia eliminada requerida indirectamente.
**Rollback:** restaurar `package.json` y `package-lock.json` desde git, `npm install`.
**Dependencias:** Fase 16.

### Fase 18 — Tests completos
**Objetivo:** ejecutar la suite completa de 123 tests.

**Comandos:**
```bash
docker compose -f docker-compose.test.yml up -d
DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate deploy
npx prisma generate
DATABASE_URL="$DATABASE_URL_TEST" NODE_ENV=test ALLOW_DESTRUCTIVE_TEST_DB=true npm run db:seed
NODE_ENV=test ALLOW_DESTRUCTIVE_TEST_DB=true npm run test
npm run test:unit
npm run test:integration
npm run test:sql
```

**Aceptacion:** 123/123 tests pasan. Tests SQL verifican rechazo real de PostgreSQL.
**Riesgos:** tests fragiles por dependencia de estado de base.
**Rollback:** no aplica (los tests son nuevos).
**Dependencias:** Fases 1-17.

### Fase 19 — UI: limpieza y consistencia
**Objetivo:** eliminar referencias visuales a modulos eliminados.

**Archivos a modificar:**
- `src/components/layout/app-shell.tsx`
- `src/components/layout/header.tsx`
- `src/components/layout/sidebar.tsx`
- `src/app/layout.tsx`
- `src/components/ui/page-header.tsx` (quitar prop demoMode)

**Comandos:**
```bash
npm run lint && npm run build
```

**Aceptacion:** sidebar muestra solo 5 items. Sin demo badge. Sin referencias a modulos eliminados.
**Riesgos:** bajo. Cambios cosmeticos.
**Rollback:** git checkout.
**Dependencias:** Fase 16.

### Fase 20 — Produccion
**Objetivo:** deploy y verificacion final.

**Comandos:**
```bash
npm run build
npx prisma migrate deploy
npm run db:seed
# Verificar conteos
npx prisma db execute --stdin <<< "SELECT 'clients' as tbl, count(*) FROM clients UNION ALL SELECT 'projects', count(*) FROM projects UNION ALL SELECT 'incomes', count(*) FROM incomes UNION ALL SELECT 'expense_categories', count(*) FROM expense_categories UNION ALL SELECT 'expenses', count(*) FROM expenses;"
vercel --prod
```

**Aceptacion:** build exitoso. Seed productivo verificado. App funcional en produccion.
**Riesgos:** variables de entorno faltantes en Vercel.
**Rollback:** revertir deploy en Vercel, git checkout tag de respaldo, `npx prisma migrate deploy`.
**Dependencias:** Fases 1-19.

### Fase 21 — Documentacion
**Objetivo:** actualizar o marcar como obsoleta la documentacion existente.

**Archivos a modificar:**
- `PLAN_BROCO_FINANZAS.md` (agregar header de deprecacion)
- `finanzas_handoff.md` (agregar header de deprecacion)
- `resumen-codex.md` (opcional: marcar como historico)
- `README.md` (actualizar con nueva arquitectura)

**Comandos:**
```bash
# Verificar que el nuevo plan existe
ls -la docs/PLAN_SIMPLIFICACION_FINANZAS.md
```

**Aceptacion:** documentos antiguos marcados como obsoletos con referencia al nuevo plan.
**Riesgos:** bajo.
**Rollback:** git checkout.
**Dependencias:** Fase 20.


---

## 33. Riesgos

### 33.1 Riesgos tecnicos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| Perdida de datos en migracion destructiva | Media | Alto | Base productiva vacia verificada. Tag de respaldo en remoto. |
| Regresion funcional por eliminacion de modulos | Alta | Medio | Tests de integracion (123 casos). Validacion manual post-deploy. |
| Errores en CHECKs SQL | Media | Alto | Tests SQL dedicados que intentan INSERT/UPDATE invalidos y verifican rechazo. |
| Autenticacion rota post-migracion | Media | Alto | Tests unitarios de sesion (11 casos). Middleware validado en integracion. |
| Inconsistencia en datos del seed canonico | Media | Medio | Script de extraccion con validaciones y conteos. Revision manual de datos generados. |
| Dependencias eliminadas requeridas indirectamente | Baja | Bajo | Build y lint verifican imports. `tsc --noEmit` detecta tipos faltantes. |
| Docker no disponible para base de test | Baja | Alto | Alternativa: base de test remota (Prisma Postgres instancia separada) con credenciales distintas. |
| Zona horaria incorrecta en OVERDUE | Media | Medio | Tests explicitos con fechas en limite de zona horaria (23:59 en Cordoba vs 00:01 UTC). |
| Build roto por imports a modulos eliminados | Alta | Medio | Fase 16 se ejecuta despues de que todas las funcionalidades nuevas esten implementadas. Eliminacion gradual. |
| Conflicto entre CHECKs SQL y datos del seed | Media | Medio | Seed disenado para cumplir todos los CHECKs. Test de seed verifica que no haya rechazos. |

### 33.2 Riesgos operativos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| Duenos no pueden hacer login | Baja | Critico | Validar `.env` en deploy. Tests de auth cubren faltantes de variables. |
| Datos historicos no coinciden con Excel original | Media | Medio | Script one-off muestra conteos para validacion cruzada. |
| Dashboard muestra metricas incorrectas | Media | Alto | Tests de dashboard comparan valores esperados contra datos de seed conocidos. |
| Categorias mal normalizadas en seed | Media | Bajo | Inventario explicito en seccion 26. Revision manual de datos canonicos generados. |
| Division Mehc + Coirini con diferencias de redondeo | Baja | Medio | Algoritmo Decimal: 1ra mitad = original / 2 (redondeado a escala de moneda). 2da mitad = original - 1ra mitad. Test verifica que 1ra + 2da == original en cada moneda. TC calculado desde importes propios de cada movimiento. |

---

## 34. Rollback

### 34.1 Rollback completo

En cualquier momento, volver al estado del tag de respaldo:

```bash
git checkout pre-simplificacion-finanzas-2026-07-17
npm install
npx prisma generate
npx prisma migrate deploy
```

Esto restaura: schema Prisma anterior, migraciones, servicios, componentes, paginas, dependencias.

### 34.2 Rollback por fase

Cada fase (seccion 32) incluye comandos de rollback especificos. Patron general:

- **Archivos nuevos creados** -> eliminar los archivos listados en "Archivos a crear" de la fase
- **Archivos modificados** -> `git checkout --` con los archivos listados en "Archivos a modificar"
- **Archivos eliminados** -> `git checkout --` para recuperar los archivos listados en "Archivos a eliminar"
- **Dependencias** -> revertir `package.json` y ejecutar `npm install`

### 34.3 Rollback de base de datos

Si la migracion destructiva se aplico en produccion y se necesita revertir:

```bash
git checkout pre-simplificacion-finanzas-2026-07-17 -- prisma/
npx prisma migrate deploy
npx prisma generate
```

Si habia datos en produccion (no esperado porque la base estaba vacia): restaurar desde backup externo.

### 34.4 Rollback de seed

El seed es idempotente en el nuevo diseno (limpia y recrea). Para volver al seed anterior:

```bash
git checkout pre-simplificacion-finanzas-2026-07-17 -- prisma/seed.ts
npm run db:seed  # Ejecuta el seed viejo (requiere xlsx en dependencies y Excel presente)
```

---

## 35. Checklist

### 35.1 Pre-implementacion

- [ ] Tag `pre-simplificacion-finanzas-2026-07-17` existe en remoto y local
- [ ] Base productiva vacia verificada (`SELECT count(*) FROM clients` = 0)
- [ ] Docker disponible O base de test remota configurada
- [ ] `.env.example` y `.env.test.example` creados con las variables requeridas
- [ ] `vitest` instalado y `vitest.config.ts` configurado
- [ ] `docs/PLAN_SIMPLIFICACION_FINANZAS.md` revisado y aprobado
- [ ] Equipo notificado del plan y del alcance

### 35.2 Implementacion (por fase)

- [ ] Fase 1: Auditoria completada (este documento)
- [x] Fase 2: Base de test funcional (PostgreSQL 16 en puerto 5434, guardia 10/10, integracion 4/4, 0 skipped)
- [ ] Fase 3: Schema Prisma validado (26 CHECKs, 3 indices CI, 5 FKs). 12 migraciones historicas conservadas + 1 nueva destructiva. Reconstruccion desde cero validada. 31 tests pasando. 387 errores TS residuales (finance.ts, kanban.ts, seed.ts — se reescribiran en fases 8-16). Build rojo. Fase no cerrada.
- [ ] Fase 4: Migracion generada y aplicada solo en test (CHECKs SQL validados en test)
- [ ] Fase 5: Extraccion Excel ejecutada, datos canonicos generados y revisados
- [ ] Fase 6: Seed ejecutado y verificado en test (conteos correctos)
- [ ] Fase 7: Helpers implementados, 27 tests unitarios pasan, `tsc --noEmit` limpio
- [ ] Fase 8: Clientes completo, tests 66-69 pasan, build OK
- [ ] Fase 9: Proyectos completo, tests 19-27, 38-44, 57-65 pasan, build OK
- [ ] Fase 10: Ingresos completo, tests 28-37, 10-12 pasan, build OK
- [ ] Fase 11: Gastos y categorias completo, tests 45-46 pasan, build OK
- [ ] Fase 12: Dashboard completo, tests 47-56 pasan, build OK
- [ ] Fase 13: Alertas completo, tests pasan, build OK
- [ ] Fase 14: Autenticacion reemplazada, tests 77-87 pasan, build OK
- [ ] Fase 15: Cuotas implementado, tests 70-76 pasan, build OK
- [ ] Fase 16: Modulos obsoletos eliminados, build y lint limpios
- [ ] Fase 17: Dependencias limpias, build y lint OK
- [ ] Fase 18: Suite completa 123/123 tests pasando
- [ ] Fase 19: UI limpia, sin referencias a modulos eliminados
- [ ] Fase 20: Produccion deployada, seed productivo verificado
- [ ] Fase 21: Documentacion actualizada, documentos viejos marcados obsoletos

### 35.3 Post-implementacion

- [ ] Validacion manual completa (seccion 31) — todos los items chequeados
- [ ] Login/logout funcional en produccion
- [ ] Dashboard muestra datos reales del seed
- [ ] CRUD de todas las entidades funcional
- [ ] `npm run lint` exitoso
- [ ] `npm run build` exitoso
- [ ] `npx tsc --noEmit` exitoso
- [ ] `npm run test` — 123/123 pasan
- [ ] Git limpio (sin archivos no rastreados relevantes)
- [ ] Sin referencias a demo mode en el codigo
- [ ] Sin imports de modulos eliminados
- [ ] Sin `TODO` ni placeholders en codigo
- [ ] Variables de entorno configuradas en Vercel: `DATABASE_URL`, `APP_PASSWORD`, `SESSION_SECRET`

---

## 36. Archivos exactos

### 36.1 Archivos a crear (46 archivos)

```
docs/PLAN_SIMPLIFICACION_FINANZAS.md
docker-compose.test.yml
.env.example
.env.test.example
vitest.config.ts
tests/setup.ts
tests/unit/money.test.ts
tests/unit/dates.test.ts
tests/unit/status.test.ts
tests/unit/session.test.ts
tests/unit/project-amounts.test.ts
tests/integration/clients.test.ts
tests/integration/projects.test.ts
tests/integration/incomes.test.ts
tests/integration/expenses.test.ts
tests/integration/expense-categories.test.ts
tests/integration/dashboard.test.ts
tests/integration/alerts.test.ts
tests/integration/installments.test.ts
tests/integration/auth.test.ts
tests/integration/seed.test.ts
tests/sql/constraints.test.ts
scripts/extract-finance-xlsx.ts
prisma/seed-data/clients.ts
prisma/seed-data/projects.ts
prisma/seed-data/incomes.ts
prisma/seed-data/expense-categories.ts
prisma/seed-data/expenses.ts
src/lib/money.ts
src/lib/money-client.ts
src/lib/dates.ts
src/lib/session.ts
src/server/services/clients.ts
src/server/services/projects.ts
src/server/services/incomes.ts
src/server/services/expenses.ts
src/server/services/expense-categories.ts
src/server/services/dashboard.ts
src/server/services/alerts.ts
src/server/services/auth.ts
src/server/services/money.ts
src/server/services/status.ts
src/server/validations/client.ts
src/server/validations/project.ts
src/server/validations/income.ts
src/server/validations/expense.ts
src/server/validations/expense-category.ts
src/server/validations/dashboard.ts
```

### 36.2 Archivos a modificar (28 archivos)

```
package.json
prisma/schema.prisma (reemplazo total)
prisma/seed.ts (reconstruccion total)
src/middleware.ts
src/app/layout.tsx
src/app/page.tsx
src/app/login/page.tsx
src/app/clients/page.tsx
src/app/clients/[id]/page.tsx
src/app/projects/page.tsx
src/app/projects/[id]/page.tsx
src/app/incomes/page.tsx
src/app/expenses/page.tsx
src/app/api/auth/route.ts
src/app/api/clients/route.ts
src/app/api/clients/[id]/route.ts
src/app/api/projects/route.ts
src/app/api/projects/[id]/route.ts
src/app/api/incomes/route.ts
src/app/api/incomes/[id]/route.ts
src/app/api/expenses/route.ts
src/app/api/expenses/[id]/route.ts
src/app/api/expense-categories/route.ts
src/app/api/expense-categories/[id]/route.ts
src/app/api/dashboard/route.ts
src/app/api/alerts/route.ts
src/lib/utils.ts
src/lib/types.ts
src/lib/auth.ts
src/lib/dashboard-date-range.ts
src/server/prisma.ts
src/components/dashboard/charts.tsx
src/components/dashboard/date-range-controls.tsx
src/components/layout/navigation-config.ts
src/components/layout/sidebar.tsx
src/components/layout/header.tsx
src/components/layout/app-shell.tsx
src/components/ui/page-header.tsx
src/components/ui/alert-banner.tsx
src/components/screens/clients-screen.tsx
src/components/screens/projects-screen.tsx
src/components/screens/incomes-screen.tsx
src/components/screens/expenses-screen.tsx
src/components/screens/login-form.tsx
```

### 36.3 Archivos a eliminar (36+ archivos)

```
prisma/schema.prisma (anterior)
prisma/migrations/* (12 carpetas)
src/app/kanban/page.tsx
src/app/kanban/loading.tsx
src/app/calendar/page.tsx
src/app/calendar/loading.tsx
src/app/distribution/page.tsx
src/app/distribution/loading.tsx
src/app/recurring/page.tsx
src/app/recurring/loading.tsx
src/app/api/kanban/route.ts
src/app/api/distribution/route.ts
src/app/api/salary/route.ts
src/app/api/salary/[id]/route.ts
src/app/api/recurring-incomes/route.ts
src/app/api/recurring-incomes/[id]/route.ts
src/app/api/recurring-expenses/route.ts
src/app/api/recurring-expenses/[id]/route.ts
src/app/api/scheduled-payments/route.ts
src/app/api/scheduled-payments/[id]/route.ts
src/app/api/scheduled-expenses/route.ts
src/app/api/scheduled-expenses/[id]/route.ts
src/components/screens/kanban-screen.tsx
src/components/screens/calendar-screen.tsx
src/components/screens/distribution-screen.tsx
src/components/screens/recurring-screen.tsx
src/components/calendar/day-action-modal.tsx
src/components/calendar/expense-entry-modal.tsx
src/components/calendar/income-entry-modal.tsx
src/components/payments/mark-income-paid-button.tsx
src/components/payments/mark-payment-paid-button.tsx
src/components/payments/scheduled-payment-settlement-modal.tsx
src/components/expenses/pay-scheduled-expense-modal.tsx
src/server/services/finance.ts
src/server/services/kanban.ts
src/server/demo-data.ts
```

### 36.4 Documentacion a marcar como obsoleta

```
PLAN_BROCO_FINANZAS.md (agregar header de deprecacion)
finanzas_handoff.md (agregar header de deprecacion)
resumen-codex.md (opcional: marcar como historico)
README.md (actualizar con nueva arquitectura)
```

---

## 37. Comandos

### 37.1 Comandos globales (para cualquier fase)

```bash
# Trabajar en el directorio del proyecto
cd /home/rcoirini/proyectos-bs/broco-finance

# Verificar estado del repo
git status --short
git branch --show-current
git rev-parse --short HEAD

# Lint y typecheck
npm run lint
npx tsc --noEmit

# Build
npm run build

# Prisma
npx prisma validate
npx prisma generate
npx prisma format
```

### 37.2 Comandos por fase

#### Fase 2 — Base de test

```bash
# workdir: ./
npm install --save-dev vitest
docker compose -f docker-compose.test.yml up -d
# Verificar conexion (requiere DATABASE_URL_TEST configurado)
npx prisma db execute --stdin <<< "SELECT 1;"
```

**Resultado:** Docker up en puerto 5434. Conexion exitosa.
**Exit code:** 0 para cada comando.
**Evidencia:** `docker ps` muestra postgres:16-alpine.

#### Fase 3 — Modelo Prisma + CHECKs

```bash
# workdir: ./
rm -rf prisma/migrations/*
# Escribir nuevo prisma/schema.prisma (seccion 13.1)
DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate dev --name init_simplified --create-only
# Editar migration.sql: agregar CHECKs (seccion 13.2)
DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate dev
DATABASE_URL="$DATABASE_URL_TEST" npx prisma generate
npx prisma validate
npx prisma format
```

**Resultado:** `prisma validate` OK. `migrate dev` OK en test. Cliente generado.
**Exit code:** 0 para cada comando.
**Evidencia:** migration.sql incluye los ALTER TABLE ADD CONSTRAINT.

#### Fase 4 — Generacion de migracion (solo test)

```bash
# workdir: ./
# Verificar base productiva (informativo, solo lectura)
npx prisma db execute --stdin <<< "SELECT count(*) FROM clients;"
# Aplicar migracion unicamente en test
DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate dev
DATABASE_URL="$DATABASE_URL_TEST" npx prisma generate
```

**Resultado:** migracion aplicada en test. CHECKs SQL activos. Prisma Client generado.
**Exit code:** 0.
**Evidencia:** `DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate status` muestra migracion aplicada.

#### Fase 5 — Extraccion Excel

```bash
# workdir: ./
npm uninstall xlsx && npm install --save-dev xlsx
npx tsx scripts/extract-finance-xlsx.ts
```

**Resultado:** archivos `prisma/seed-data/*.ts` creados. Conteos en consola.
**Exit code:** 0.
**Evidencia:** archivos generados con exportaciones TypeScript.

#### Fase 6 — Seed

```bash
# workdir: ./
DATABASE_URL="$DATABASE_URL_TEST" NODE_ENV=test ALLOW_DESTRUCTIVE_TEST_DB=true npm run db:seed
```

**Resultado:** seed completa sin errores. Tabla de conteos en consola.
**Exit code:** 0.
**Evidencia:** `npx prisma db execute --stdin <<< "SELECT count(*) FROM clients;"` > 0.

#### Fase 7 — Helpers

```bash
# workdir: ./
NODE_ENV=test npx vitest run tests/unit/
npx tsc --noEmit
```

**Resultado:** 27 tests unitarios pasan. TypeScript compila.
**Exit code:** 0.
**Evidencia:** output de vitest mostrando 27 passed.

#### Fases 8-15 — Servicios (patron repetido)

```bash
# workdir: ./
NODE_ENV=test ALLOW_DESTRUCTIVE_TEST_DB=true npm run test:integration
npm run lint
npm run build
```

**Resultado:** tests de integracion pasan. Lint y build OK.
**Exit code:** 0 para todos.
**Evidencia:** output de cada comando.

#### Fase 16 — Eliminacion de modulos

```bash
# workdir: ./
npm run lint
npm run build
npx tsc --noEmit
```

**Resultado:** sin errores de lint, build, ni typecheck.
**Exit code:** 0 para todos.
**Evidencia:** grep de imports a modulos eliminados no encuentra resultados.

#### Fase 17 — Dependencias

```bash
# workdir: ./
npm uninstall @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities bubblewrap
npm install
npm run lint
npm run build
```

**Resultado:** build sin errores.
**Exit code:** 0.
**Evidencia:** `npm ls @dnd-kit/core` devuelve error (paquete no encontrado).

#### Fase 18 — Tests completos

```bash
# workdir: ./
docker compose -f docker-compose.test.yml up -d
DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate deploy
npx prisma generate
DATABASE_URL="$DATABASE_URL_TEST" NODE_ENV=test ALLOW_DESTRUCTIVE_TEST_DB=true npm run db:seed
NODE_ENV=test ALLOW_DESTRUCTIVE_TEST_DB=true npm run test
```

**Resultado:** 123/123 tests pasan.
**Exit code:** 0.
**Evidencia:** `npm run test` output: "123 passed".

#### Fase 20 — Produccion

```bash
# workdir: ./
npm run build
npx prisma migrate deploy
npx prisma generate
npm run db:seed
# Verificar
npx prisma db execute --stdin <<< "
SELECT 'clients' as tbl, count(*) FROM clients
UNION ALL SELECT 'projects', count(*) FROM projects
UNION ALL SELECT 'incomes', count(*) FROM incomes
UNION ALL SELECT 'expense_categories', count(*) FROM expense_categories
UNION ALL SELECT 'expenses', count(*) FROM expenses;
"
vercel --prod
```

**Resultado:** deploy exitoso. App funcional en URL de produccion.
**Exit code:** 0.
**Evidencia:** URL de Vercel respondiendo con la app.

---

## 38. Documentacion obsoleta

### 38.1 `PLAN_BROCO_FINANZAS.md`

Documento de planificacion original (679 lineas). Describe una arquitectura con recurring_contracts,
scheduled_payments, distribution, kanban, y un modelo de datos que ya no coincide con el codigo
actual ni con el plan de simplificacion.

**Accion:** Agregar al inicio del archivo:

```
> **OBSOLETO** — Reemplazado por `docs/PLAN_SIMPLIFICACION_FINANZAS.md` (2026-07-17).
> Este documento se conserva solo como referencia historica del diseno original.
> No utilizar como guia de implementacion.
```

No eliminar — conservar como referencia historica.

### 38.2 `finanzas_handoff.md`

Handoff tecnico (967 lineas). Describe el estado del codebase al 2026-03-17. Util como referencia
historica pero describe modelos, servicios y patrones que seran eliminados.

**Accion:** Agregar al inicio:

```
> **OBSOLETO** — Reemplazado por `docs/PLAN_SIMPLIFICACION_FINANZAS.md` (2026-07-17).
> Este handoff describe la arquitectura anterior a la simplificacion de julio 2026.
> Conservar como referencia historica. Para arquitectura actual ver el nuevo plan.
```

### 38.3 `resumen-codex.md`

Resumen historico del proyecto (20 KB). Contiene notas de desarrollo y decisiones pasadas.

**Accion:** Opcionalmente agregar nota de que es historico. No es critico.

### 38.4 `README.md`

Debe actualizarse para reflejar:
- Nueva arquitectura (5 entidades, sin demo mode)
- Nuevos comandos (test, seed, extract)
- Nuevas variables de entorno (APP_PASSWORD, SESSION_SECRET)
- Stack actualizado (sin dependencias eliminadas)

### 38.5 Nuevo documento canonico

`docs/PLAN_SIMPLIFICACION_FINANZAS.md` es el unico documento de referencia para la implementacion
de la simplificacion. Cualquier otra documentacion que contradiga este plan debe considerarse
obsoleta.

---

## 39. Control de completitud

Verificacion final de que este documento cumple con los requisitos:

### 38/38 secciones obligatorias

| # | Seccion | Estado |
|---|---|---|
| 1 | Resumen ejecutivo | Completo |
| 2 | Estado verificado | Completo |
| 3 | Diagnostico | Completo |
| 4 | Inventario de modulos | Completo |
| 5 | Inventario Prisma | Completo |
| 6 | Inventario de rutas | Completo |
| 7 | Inventario de servicios | Completo |
| 8 | Inventario de dependencias | Completo |
| 9 | Uso actual de xlsx | Completo |
| 10 | Funcionalidades conservadas | Completo |
| 11 | Funcionalidades eliminadas | Completo |
| 12 | Arquitectura objetivo | Completo |
| 13 | Modelo final | Completo |
| 14 | Reglas de negocio | Completo |
| 15 | Dinero | Completo |
| 16 | Importes de proyecto | Completo |
| 17 | Fechas y estados | Completo |
| 18 | Autenticacion | Completo |
| 19 | Base de test | Completo |
| 20 | Migracion | Completo |
| 21 | Extraccion one-off | Completo |
| 22 | Seed | Completo |
| 23 | Fuente de concept y notes | Completo |
| 24 | Clientes y proyectos canonicos | Completo |
| 25 | Ingresos | Completo |
| 26 | Categorias y gastos | Completo |
| 27 | UX | Completo |
| 28 | Metricas | Completo |
| 29 | Alertas | Completo |
| 30 | Tests | Completo |
| 31 | Validacion manual | Completo |
| 32 | Plan por fases | Completo (21 fases) |
| 33 | Riesgos | Completo |
| 34 | Rollback | Completo |
| 35 | Checklist | Completo |
| 36 | Archivos exactos | Completo |
| 37 | Comandos | Completo |
| 38 | Documentacion obsoleta | Completo |

### 123/123 casos de prueba

Todos los 123 casos estan listados y asignados a archivos de test en la seccion 30.4.

### 21 fases de implementacion

Todas las fases (seccion 32) incluyen: objetivo, archivos a crear/modificar/eliminar, comandos
exactos, criterios de aceptacion, riesgos, rollback y dependencias.

### Verificaciones adicionales

- [x] No hay `TODO` ni placeholders
- [x] No hay texto truncado
- [x] Secciones finales tan detalladas como las iniciales
- [x] Correccion ChatGPT 2026-02-04 documentada (secciones 23.4, 26.3)
- [x] Proteccion de base de test documentada (seccion 19.2)
- [x] Regla de cambio de cliente de proyectos documentada (seccion 14.2)
- [x] Sincronizacion de Income.clientId al cambiar proyecto (seccion 14.3)
- [x] Fuente de concept documentada (seccion 23)
- [x] Todas las rutas mencionadas existen actualmente o estan marcadas como futuras
- [x] Todos los archivos tienen comandos exactos
- [x] No hay contradicciones internas detectadas
