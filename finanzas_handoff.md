# Finanzas Handoff

> HISTÓRICO / NO OPERATIVO. No usar este documento como runbook ni como
> descripción del login actual. El sistema vigente usa Auth.js, usuarios
> individuales y roles; consultar `docs/PRODUCCION.md` y `docs/HORAS_V1.md`.

Documento de contexto técnico del proyecto `BrocoFinance` para futuras sesiones de trabajo, onboarding técnico y consumo por otros agentes.

Estado del análisis: basado en el codebase actual de `/home/tomas/BrocoFinance` al 2026-03-17.

## 1. Propósito del sistema

`BrocoFinance` es una aplicación interna para operar la caja de Broco Solutions sin depender de spreadsheets. El sistema centraliza:

- clientes y proyectos;
- ingresos reales y pendientes;
- gastos reales y gastos programados;
- cobranzas de mantenimiento;
- alertas operativas de cobro;
- dashboard financiero con KPIs y gráficos;
- distribución manual de remanente y registro de retiros.

La moneda canónica es USD. Los montos en ARS son auxiliares y siempre se normalizan a USD cuando se guardan.

## 2. Arquitectura y stack

### 2.1 Stack principal

- Framework: Next.js 14 con App Router.
- Runtime UI: React 18.
- Lenguaje: TypeScript.
- ORM: Prisma.
- Base de datos: PostgreSQL usando `DATABASE_URL` compatible con Prisma Postgres / Vercel Postgres.
- Estilos: Tailwind CSS 3 con tokens propios en `tailwind.config.ts` y `globals.css`.
- Gráficos: Recharts.
- Deploy esperado: Vercel.

Dependencias relevantes en `package.json`:

```json
{
  "next": "^14.2.35",
  "react": "^18.3.1",
  "@prisma/client": "^6.19.2",
  "prisma": "^6.19.2",
  "tailwindcss": "^3.4.19",
  "recharts": "^3.8.0",
  "zod": "^4.3.6"
}
```

### 2.2 Organización por capas

La estructura sigue una separación simple y efectiva:

- `src/app/**`
  - rutas App Router;
  - páginas server-first;
  - `loading.tsx` por ruta;
  - route handlers HTTP en `src/app/api/**`.
- `src/components/screens/**`
  - pantallas cliente con formularios, tablas y modales;
  - contienen casi toda la interacción UI.
- `src/components/ui/**`
  - primitives propias: `Card`, `Button`, `Badge`, `DataTable`, `PageHeader`, skeletons, etc.
- `src/components/layout/**`
  - shell global, sidebar, header y navegación.
- `src/server/services/finance.ts`
  - núcleo de reglas de negocio, queries Prisma, validaciones de dominio y sincronizaciones.
- `src/server/prisma.ts`
  - singleton de Prisma Client;
  - normalización runtime de `DATABASE_URL` para Vercel/Prisma Postgres.
- `src/lib/**`
  - tipos compartidos, auth helpers, utilidades, date range del dashboard, API client.
- `prisma/schema.prisma`
  - single source of truth del modelo relacional.
- `prisma/seed.ts`
  - importador desde Excel y seed operativo inicial.

### 2.3 Patrón de render y data fetching

La app usa páginas server-side con `export const dynamic = "force-dynamic"` en las vistas principales. El patrón dominante es:

1. La página server carga datos con servicios del módulo `finance.ts`.
2. La pantalla UI recibe payload ya mapeado a tipos serializables.
3. Las mutaciones se hacen por `fetch` a `src/app/api/**`.
4. Los route handlers llaman a `finance.ts`.
5. Las mutaciones hacen `revalidateTag("dashboard")` para invalidar el cache analítico.

Ejemplo de carga paralela en páginas:

```ts
const [{ data: projects, demoMode }, { data: clients }] = await Promise.all([
  listProjects(),
  listClients(null),
]);
```

Este patrón se repite en `projects`, `incomes`, `expenses`, `calendar` y otras vistas para evitar serializar queries independientes.

### 2.4 Performance y cache

El dashboard usa cache de Next.js con `unstable_cache` y tags:

```ts
const getCachedDashboard = unstable_cache(
  async (serializedFilters: string) => {
    const filters = dashboardFilterSchema.parse(JSON.parse(serializedFilters));
    return getDashboardFromDatabase(filters);
  },
  ["dashboard-payload"],
  {
    tags: [dashboardTag],
    revalidate: 300,
  },
);
```

Cada mutación relevante usa este wrapper:

```ts
async function withDashboardRevalidation<T>(operation: Promise<T>) {
  const result = await operation;
  revalidateTag(dashboardTag);
  return result;
}
```

Consecuencias:

- el dashboard no recalcula toda la agregación en cada refresh;
- los cambios de ingresos, gastos, proyectos, pagos programados, distribución y salarios invalidan el cache analítico;
- el costo fuerte queda concentrado en la capa server, no en el cliente.

Además se optimizó Prisma con:

- `select` finos en queries de lectura;
- `Promise.all` para agregaciones paralelas;
- índices nuevos en FKs, status, type y fechas;
- agrupación mensual corregida por `yyyy-MM` para no mezclar años.

## 3. Autenticación y acceso

El sistema no tiene usuarios ni roles. Es una app interna con contraseña compartida.

### 3.1 Flujo

- El login compara el password contra `APP_PASSWORD`.
- Si `APP_PASSWORD` no existe, acepta la contraseña demo `"demo"`.
- Si valida, setea cookie `broco_session`.
- `middleware.ts` protege todo excepto `/login`, `/api/auth`, `/_next` y assets públicos.

### 3.2 Implicancias

- No hay tabla de usuarios.
- No hay JWT ni OAuth.
- La seguridad es deliberadamente simple para uso interno.

## 4. Modelo de datos: single source of truth

La fuente real del modelo es `prisma/schema.prisma`. La app ya no usa el modelo viejo de `recurring_contracts`; la recurrencia de mantenimiento vive directamente en `Project.monthlyFeeUsd` y `Project.monthlyFeeEndDate`.

### 4.1 Entidades core

#### Client

Representa una cuenta comercial.

Campos relevantes:

- `id`
- `name` único
- `contactName`
- `contactEmail`
- `contactPhone`
- `notes`
- timestamps

Relación:

- `Client 1 -> N Project`

#### Project

Es la unidad central de negocio. Agrupa ingresos, algunos gastos y toda la lógica de mantenimiento.

Campos relevantes:

- `clientId`
- `name`
- `status`: `ACTIVE | COMPLETED | CANCELLED`
- `devBudgetUsd`
- `monthlyFeeUsd`
- `monthlyFeeEndDate`
- `notes`

Relaciones:

- `Project N -> 1 Client`
- `Project 1 -> N Income`
- `Project 1 -> N Expense`
- `Project 1 -> N ScheduledPayment`

Regla crítica:

- `Project` es el padre de la recurrencia.
- Si `monthlyFeeUsd > 0` y el proyecto está `ACTIVE`, el sistema genera y mantiene automáticamente `ScheduledPayment` de tipo `MAINTENANCE`.
- `monthlyFeeEndDate` limita hasta qué mes se generan cobros futuros.

#### Income

Representa caja real o previsión de cobro.

Campos relevantes:

- `projectId`
- `date`
- `status`: `PAID | PENDING`
- `type`: `DEVELOPMENT | MAINTENANCE`
- `amountUsd`
- `amountArs`
- `exchangeRate`
- `notes`

Relaciones:

- `Income N -> 1 Project`
- `Income 1 -> 0..1 ScheduledPayment` por `actualIncomeId`

#### Expense

Representa egreso ejecutado.

Campos relevantes:

- `date`
- `categoryId`
- `expenseType`: `fixed | variable`
- `projectId` opcional
- `amountUsd`
- `amountArs`
- `exchangeRate`
- `description`
- `salaryWithdrawalId` opcional
- `notes`

Relaciones:

- `Expense N -> 1 ExpenseCategory`
- `Expense N -> 0..1 Project`
- `Expense 1 -> 0..1 ScheduledExpense`
- `Expense 1 -> 0..1 SalaryWithdrawal`

#### ScheduledPayment

Representa un cobro esperado, principalmente de mantenimiento.

Campos relevantes:

- `projectId`
- `type`
- `expectedDate`
- `expectedAmountUsd`
- `status`: `pending | paid | overdue | cancelled`
- `paidAt`
- `actualIncomeId`
- `notes`

Relaciones:

- `ScheduledPayment N -> 1 Project`
- `ScheduledPayment 0..1 -> 1 Income` por conciliación

#### ScheduledExpense

Representa un gasto recurrente esperado aún no pagado.

Campos relevantes:

- `recurringExpenseId`
- `dueDate`
- `amountUsd`
- `status`: `PENDING | PAID`
- `paidAt`
- `actualExpenseId`

Relaciones:

- `ScheduledExpense N -> 1 RecurringExpense`
- `ScheduledExpense 0..1 -> 1 Expense`

### 4.2 Entidades de soporte

#### ExpenseCategory

Catálogo de categorías de gasto. Algunas son default y otras creadas por el usuario.

#### RecurringExpense

Plantilla de gasto recurrente. Genera `ScheduledExpense` a futuro según frecuencia (`monthly`, `quarterly`, `biannual`, `annual`).

#### DistributionConfig

Solo dos capas:

- `emergency`
- `growth`

Guarda montos manuales separados del remanente y ubicación física/financiera.

#### SalaryWithdrawal

Retiro manual por persona y mes. Al crearse, genera automáticamente un `Expense` vinculado en categoría `Sueldos/Honorarios`.

### 4.3 Relación crítica: proyecto como fuente de verdad de recurrencia

La regla vigente no usa una tabla de contratos de mantenimiento. La recurrencia sale del proyecto:

```ts
const activeSubscription = isActiveProjectStatus(project.status) && monthlyFeeUsd > 0;
```

Si esa condición no se cumple:

- se eliminan `ScheduledPayment` pendientes de mantenimiento desde el mes actual en adelante.

Si sí se cumple:

- se generan pagos mensuales desde el mes actual;
- se extienden hasta `monthlyFeeEndDate` si existe;
- si no existe, se mantiene un horizonte de 12 meses;
- si cambia el monto, se actualizan los pagos pendientes futuros.

Esto convierte a `Project.monthlyFeeUsd` en la fuente de verdad de suscripción.

## 5. Índices de performance agregados

Se agregaron índices Prisma para reducir costo de filtros, joins y rangos por fecha. Los más importantes:

### 5.1 Projects

- `@@index([clientId, status])`
- `@@index([status])`
- `@@index([status, monthlyFeeEndDate])`

### 5.2 Incomes

- `@@index([projectId, date])`
- `@@index([status, date])`
- `@@index([projectId, status, date])`
- `@@index([type, date])`

### 5.3 ScheduledPayments

- `@@index([projectId, expectedDate])`
- `@@index([status, expectedDate])`
- `@@index([type, expectedDate])`
- `@@index([projectId, status, expectedDate])`

### 5.4 Expenses

- `@@index([categoryId, date])`
- `@@index([projectId, date])`
- `@@index([expenseType, date])`
- `@@index([projectId, expenseType, date])`

### 5.5 RecurringExpenses / ScheduledExpenses / SalaryWithdrawals

- `RecurringExpense`: `@@index([categoryId, isActive])`, `@@index([isActive, startDate])`
- `ScheduledExpense`: `@@index([status, dueDate])`, `@@index([recurringExpenseId, dueDate])`
- `SalaryWithdrawal`: `@@index([personName, month])`, `@@index([month])`

## 6. Lógica de negocio core: reglas de oro

### 6.1 Separación Development vs Maintenance

Esta es la regla más importante del dominio.

- `devBudgetUsd` mide el presupuesto de desarrollo del proyecto.
- Solo los `Income` de tipo `DEVELOPMENT` descuentan ese saldo.
- `monthlyFeeUsd` representa un flujo separado de mantenimiento.
- Los ingresos `MAINTENANCE` jamás se usan para saldar desarrollo.

La deuda de desarrollo se calcula así:

```ts
developmentPendingUsd = max(devBudgetUsd - developmentCollectedUsd, 0)
```

Y `developmentCollectedUsd` considera solo ingresos:

- del proyecto;
- con `status = PAID`;
- con `type = DEVELOPMENT`.

### 6.2 Qué impacta realmente el Resultado Neto

Solo lo efectivamente cobrado/pagado afecta caja real.

Reglas:

- `Income.status = PAID` suma a ingresos reales.
- `Expense` siempre impacta porque ya es egreso ejecutado.
- `Income.status = PENDING` no entra al neto.
- `ScheduledPayment` abierto no entra al neto.
- `ScheduledExpense` pendiente no entra al neto.

Los `PENDING` se usan como previsión operativa, no como resultado realizado.

### 6.3 Qué significa Remanente

`Remanente` es histórico, no por rango.

Fórmula:

```ts
Resultado Neto histórico = SUM(incomes PAID) - SUM(expenses)
Remanente = Resultado Neto histórico - SUM(distribution layers)
```

Importante:

- no se filtra por el rango analítico del dashboard;
- ya incluye salarios porque los retiros crean `Expense`.

### 6.4 Receivable y gastos comprometidos no siguen el filtro analítico

El dashboard mezcla dos planos:

- analítico por rango: ingresos reales, egresos reales, neto del período;
- operativo actual: `Por cobrar` y `Gastos comprometidos`.

Reglas vigentes:

- `Por cobrar` mira pendientes del mes actual o vencidos y también `Income` `PENDING` hasta fin de mes.
- `Gastos comprometidos (Mes)` mira `ScheduledExpense` `PENDING` del mes actual.

Esto se hizo deliberadamente para no perder visibilidad operativa aunque el dashboard esté filtrado a otro período.

### 6.5 Actualización dinámica del fee mensual

Si se marca un `ScheduledPayment` de mantenimiento como cobrado y el monto cobrado difiere del esperado:

1. se concilia o crea el `Income` real;
2. se actualiza el `ScheduledPayment` a `paid`;
3. se actualiza `Project.monthlyFeeUsd`;
4. se propaga el nuevo monto a los pagos de mantenimiento pendientes futuros.

La lógica vive en `updateScheduledPayment`.

Esto evita divergencia entre:

- lo que se cobró realmente;
- el fee configurado del proyecto;
- los próximos cobros programados.

### 6.6 Lifecycle de suscripción con `monthlyFeeEndDate`

`monthlyFeeEndDate` funciona como límite contractual.

Comportamiento:

- si existe, el sistema genera cobros hasta ese mes inclusive;
- si el fin queda en el pasado, deja de generar nuevos cobros;
- si el proyecto no está activo o el fee es `0/null`, borra pendientes futuros de mantenimiento;
- si el fee sigue activo y sin fin, mantiene 12 meses de horizonte.

### 6.7 Proyectos cerrados y pendientes

No se permiten nuevos `Income` `PENDING` en proyectos cerrados (`COMPLETED` o `CANCELLED`).

La validación server existe para que un proyecto finalizado no siga acumulando deuda comercial nueva.

### 6.8 Gastos recurrentes

Las plantillas de `RecurringExpense` generan 12 vencimientos futuros.

Reglas:

- al crear/editar, se agregan faltantes;
- si cambia el monto, se actualizan solo pendientes futuros;
- lo ya pagado no se reescribe;
- si la plantilla se desactiva, se limpian pendientes abiertos.

### 6.9 Salarios y distribución

Los retiros se cargan manualmente desde `/distribution`.

Efecto secundario obligatorio:

- crear `SalaryWithdrawal` crea un `Expense` asociado;
- eso hace que el resultado neto y el remanente se mantengan consistentes sin doble contabilidad.

## 7. Dashboard: filtros, KPIs y composición

### 7.1 Filtro de fechas

El dashboard usa presets resueltos en `src/lib/dashboard-date-range.ts`:

- `this-month`
- `last-month`
- `last-3-months`
- `year-current`
- `custom`

El estado del filtro vive en URL:

- `preset`
- `startDate`
- `endDate`

El badge junto al título muestra exactamente el rango activo.

### 7.2 KPI semantics

#### Ingresos reales

Suma de `Income` `PAID` en el rango.

#### Egresos reales

Suma de `Expense` en el rango.

#### Resultado Neto

`Ingresos reales - Egresos reales` del rango.

#### Remanente

Histórico acumulado; no sigue el filtro.

#### Por cobrar

`ScheduledPayment` abiertos hasta fin del mes actual + `Income` `PENDING` hasta fin de mes.

#### Vencido

Solo `ScheduledPayment.status = overdue`.

#### Gastos comprometidos (Mes)

`ScheduledExpense.status = PENDING` dentro del mes actual.

### 7.3 Agregación mensual

La serie mensual usa buckets `yyyy-MM`, no solo nombre de mes. Eso evita colisiones entre, por ejemplo, `Mar 2025` y `Mar 2026`.

## 8. Frontend y UX

### 8.1 Layout general

La app usa shell persistente:

- sidebar fija en desktop;
- header superior sticky;
- contenido principal centrado con `max-width` grande.

### 8.2 Stack vertical de pantallas internas

Las vistas operativas siguen una estructura deliberada:

1. encabezado compacto;
2. formulario arriba;
3. tabla/listado abajo.

Esto aparece en:

- `Clientes`
- `Proyectos`
- `Ingresos`
- `Gastos`
- `Distribución`

La decisión optimiza el ancho útil para tablas y evita layouts de dos columnas comprimidas.

### 8.3 Navegación responsive

Desktop:

- sidebar fija a la izquierda;
- branding simplificado: logo + `Finance`;
- links con `prefetch`.

Mobile:

- header con botón hamburguesa;
- overlay modal con todos los accesos;
- scroll controlado y cierre por `Escape`.

### 8.4 Simplificación de headers

Los headers de estilo marketing fueron removidos. Hoy la convención es:

- nombre corto de la vista;
- tipografía display compacta;
- meta opcional debajo;
- acciones a la derecha.

`PageHeader` ya no muestra descripciones largas.

### 8.5 Sidebar simplificada

La sidebar quedó intencionalmente minimal:

- logo de Broco Solutions arriba;
- título `Finance`;
- navegación;
- una tarjeta inferior con la regla financiera central del remanente.

Se eliminó el texto descriptivo redundante.

### 8.6 Feedback visual de carga

Todas las rutas principales tienen `loading.tsx`:

- `/`
- `/clients`
- `/clients/[id]`
- `/projects`
- `/projects/[id]`
- `/incomes`
- `/expenses`
- `/recurring`
- `/calendar`
- `/distribution`

El sistema de carga es homogéneo y usa skeletons con shimmer:

- header;
- filtros;
- KPI cards;
- banners;
- tablas;
- gráficos;
- calendario.

La animación está definida en `globals.css` con:

- `@keyframes skeleton-shimmer`
- `@keyframes skeleton-breathe`

Y tiene soporte para `prefers-reduced-motion`.

Se eliminaron loaders textuales estáticos como patrón visual principal.

### 8.7 Charts y carga fragmentada

Los gráficos del dashboard se cargan con `next/dynamic` y `ssr: false`, cada uno con skeleton propio. Esto reduce bloqueos visuales al navegar al dashboard.

### 8.8 Calendar

`/calendar` ya no es una lista de tarjetas. Hoy ofrece:

- monthly grid tradicional en desktop;
- agenda list en mobile;
- consolidación de ingresos, gastos, `ScheduledPayment` y `ScheduledExpense`;
- badges compactas con iconografía;
- click en evento para abrir modales existentes;
- click en día vacío para alta contextual.

## 9. API y capa server

### 9.1 Principio general

Los route handlers en `src/app/api/**` son finos. Casi toda la lógica está en `src/server/services/finance.ts`.

Ventajas:

- validaciones en un solo lugar;
- reglas de negocio reutilizadas por páginas y API;
- menor duplicación.

### 9.2 Responsabilidades de `finance.ts`

- parse y validación con Zod;
- queries Prisma;
- mapeo a DTOs serializables;
- sincronización de mantenimientos;
- sincronización de recurrentes;
- cálculo de KPIs y series;
- invalidación de cache del dashboard;
- reglas de borrado y restricciones de integridad de negocio.

## 10. Demo mode vs modo persistente

Si `DATABASE_URL` no está configurada:

- la app entra en demo mode;
- usa `src/server/demo-data.ts`;
- las pantallas muestran badge `Demo Mode`;
- las mutaciones persistentes quedan bloqueadas o informan que requieren DB.

Esto permite revisar UI y lógica superficial sin base conectada.

## 11. Configuración de entorno

### 11.1 Variables necesarias

#### Obligatorias para persistencia real

- `DATABASE_URL`

#### Recomendadas para acceso real

- `APP_PASSWORD`

#### Opcionales

- `BROCO_SEED_FILE`
  - path a un `.xlsx` específico para el import inicial;
  - si no existe, el seed busca automáticamente un `.xlsx` en la raíz.
- `NODE_ENV`
  - Prisma mantiene logs `query`, `warn` y `error` para diagnóstico;
  - la cookie se marca `secure` en producción.

### 11.2 Configuración de conexión Prisma aplicada

Archivo responsable:

- `src/server/prisma.ts`

Comportamiento implementado:

- Prisma Client usa patrón singleton sobre `globalThis` para reutilizar la misma instancia en desarrollo, hot reload y reuso de lambdas warm.
- Se exporta un único cliente compartido como `prisma`.
- Se habilitan logs de Prisma en runtime con `["query", "warn", "error"]` para diagnóstico en Vercel.
- Si `DATABASE_URL` apunta a Prisma Postgres por TCP (`db.prisma.io` o `pooled.db.prisma.io`), el runtime garantiza `sslmode=require` si faltara.
- Si la URL PostgreSQL no define `connect_timeout`, el runtime agrega `connect_timeout=30`.
- Si el runtime corre en Vercel y la URL usa el host directo `db.prisma.io`, el cliente reescribe internamente a `pooled.db.prisma.io` para preferir pooled TCP en serverless.

Plantilla recomendada para Vercel con Prisma Postgres:

```env
DATABASE_URL="postgres://<USER>:<PASSWORD>@pooled.db.prisma.io:5432/?sslmode=require&connect_timeout=30"
```

Plantilla recomendada para uso directo/local si hace falta comparar o diagnosticar reachability:

```env
DATABASE_URL="postgres://<USER>:<PASSWORD>@db.prisma.io:5432/?sslmode=require&connect_timeout=30"
```

Decisión tomada sobre adapters:

- No se agregó `@prisma/adapter-pg`.
- Motivo: este proyecto usa `PrismaClient` estándar con motor Rust y Prisma Postgres TCP.
- Según la documentación oficial actual, Prisma Postgres para serverless prioriza pooled TCP; el serverless driver propio de Prisma sigue en Early Access y no está recomendado para producción.

### 11.3 Bootstrap recomendado

Instalación:

```bash
npm install
```

Generar cliente Prisma:

```bash
npx prisma generate
```

Sincronizar schema en una base existente sin destruir datos:

```bash
npx prisma db push
```

Levantar desarrollo:

```bash
npm run dev
```

### 11.3 Cuándo usar `migrate` vs `db push`

Para desarrollo limpio con historial de migraciones:

```bash
npx prisma migrate dev --name nombre_del_cambio
```

Para una base ya cargada manualmente donde no se quiere resetear:

```bash
npx prisma db push
```

### 11.4 Comandos destructivos

Reset completo de desarrollo:

```bash
npx prisma migrate reset
```

Esto borra datos. No usar sobre una base que tenga carga manual valiosa.

### 11.5 Seed

Seed manual:

```bash
npm run db:seed
```

El seed:

- importa un workbook Excel;
- crea clientes, proyectos, ingresos, gastos, categorías, pagos programados y distribución;
- usa `BROCO_SEED_FILE` si está definido.

## 12. Convenciones operativas importantes

### 12.1 USD como verdad canónica

Aunque el usuario pueda ingresar ARS y tipo de cambio, el valor persistido canónico para cálculos es `amountUsd`.

### 12.2 La distribución no redefine el neto

Las capas `emergency` y `growth` no son gastos. Son reservas manuales que se restan del neto histórico para calcular remanente disponible.

### 12.3 Salarios sí impactan neto

A diferencia de distribución, los retiros sí se convierten en `Expense`. Por eso afectan neto y remanente.

### 12.4 Borrados protegidos

No se permite eliminar:

- proyectos con movimientos asociados;
- categorías con gastos o plantillas asociadas;
- ingresos conciliados con pagos programados.

El sistema privilegia consistencia sobre flexibilidad destructiva.

## 13. Estado de pendientes y limitaciones conscientes

### 13.1 Distribución todavía depende de carga manual

La sección `Distribución` no tiene automatización de asignación de remanente. Hoy el flujo es manual para validar la lógica financiera:

- el usuario decide cuánto mover a `emergency` y `growth`;
- el usuario registra retiros manualmente;
- el sistema calcula correctamente el remanente, pero no propone ni ejecuta asignaciones automáticas.

Esto es una decisión actual del producto, no un bug.

### 13.2 Ausencia de scheduler externo

No hay cron externo visible en el repo. La actualización de `overdue` y sincronización de suscripciones/recurrentes ocurre al consultar vistas server clave como dashboard y alertas.

Implicancia:

- el sistema se autocorrige en lectura;
- no depende todavía de jobs externos.

### 13.3 Auth deliberadamente simple

No hay multiusuario ni auditoría fuerte. Si el producto escala, la autenticación es una de las primeras piezas a reemplazar.

## 14. Mapa rápido de archivos clave

### Dominio y DB

- `prisma/schema.prisma`
- `prisma/seed.ts`
- `src/server/prisma.ts`
- `src/server/services/finance.ts`
- `src/lib/types.ts`

### App Router

- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/api/**`
- `src/app/**/loading.tsx`

### Layout y navegación

- `src/components/layout/app-shell.tsx`
- `src/components/layout/sidebar.tsx`
- `src/components/layout/header.tsx`
- `src/components/layout/navigation-config.ts`

### UI base

- `src/components/ui/page-header.tsx`
- `src/components/ui/page-loading.tsx`
- `src/components/ui/data-table.tsx`
- `src/components/ui/stat-card.tsx`

### Pantallas

- `src/components/screens/clients-screen.tsx`
- `src/components/screens/projects-screen.tsx`
- `src/components/screens/incomes-screen.tsx`
- `src/components/screens/expenses-screen.tsx`
- `src/components/screens/recurring-screen.tsx`
- `src/components/screens/calendar-screen.tsx`
- `src/components/screens/distribution-screen.tsx`

## 15. Resumen ejecutivo para otro agente

Si otro agente tiene que entrar rápido, estas son las reglas que no debe romper:

1. `Project.monthlyFeeUsd` es la fuente de verdad del mantenimiento.
2. `DEVELOPMENT` y `MAINTENANCE` no se mezclan para calcular saldo de desarrollo.
3. Solo `PAID` afecta caja real, neto y remanente.
4. `Remanente` es histórico y no sigue el filtro temporal del dashboard.
5. `Por cobrar` y `Gastos comprometidos` son métricas operativas del mes actual o vencido, no analíticas.
6. Toda mutación relevante debe invalidar el tag `dashboard`.
7. Si no hay `DATABASE_URL`, la app entra en demo mode y no debe asumir persistencia.
8. Distribución sigue siendo manual; no existe automatización de asignación de capas.

## 16. Snippets de referencia

### 16.1 Regla de suscripción activa

```ts
const activeSubscription = isActiveProjectStatus(project.status) && monthlyFeeUsd > 0;
```

### 16.2 Resultado neto real

```ts
netUsd =
  incomes.filter((i) => i.status === "PAID").reduce((sum, i) => sum + i.amountUsd, 0) -
  expenses.reduce((sum, e) => sum + e.amountUsd, 0);
```

### 16.3 Remanente real

```ts
remanenteUsd = netResultUsd - emergencyLayerUsd - growthLayerUsd;
```

### 16.4 Actualización de fee por cobro conciliado

```ts
if (
  payment.type === IncomeType.MAINTENANCE &&
  requireNumber(settledAmountUsd) !== requireNumber(payment.expectedAmountUsd)
) {
  await syncProjectMaintenanceFee(tx, payment.projectId, settledAmountUsd);
}
```

### 16.5 Gastos comprometidos fuera del filtro analítico

```ts
prisma.scheduledExpense.findMany({
  where: {
    status: ScheduledExpenseStatus.PENDING,
    dueDate: {
      gte: currentMonthStart,
      lte: currentMonthEnd,
    },
  },
});
```

---

Si este documento se actualiza después de cambios estructurales, revisar primero:

- `prisma/schema.prisma`
- `src/server/services/finance.ts`
- `src/lib/types.ts`

Son las piezas con más densidad de reglas y donde más rápido se desalinean los handoffs viejos.
