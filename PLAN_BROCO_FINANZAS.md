# Plan de Desarrollo — Broco Solutions Finance App

> HISTÓRICO / NO OPERATIVO. Este documento describe una etapa anterior con
> login compartido, `APP_PASSWORD` y `broco_session`. El sistema actual usa
> Auth.js con usuarios individuales; para procedimientos vigentes consultar
> `docs/PRODUCCION.md` y `docs/HORAS_V1.md`.

## 1. Visión General

App web interna para gestión financiera de Broco Solutions. Reemplaza el Google Sheet actual con una solución más robusta para tracking de ingresos, gastos, pagos recurrentes, cuentas por cobrar, distribución por capas y dashboard con indicadores clave.

- **Usuarios:** 2 dueños. Login simple con contraseña compartida (variable de entorno + cookie). Sin roles ni permisos.
- **Moneda base:** USD. Todos los cálculos, totales y gráficos operan en USD. Se puede registrar el importe en ARS + tipo de cambio manual para referencia.
- **Gestión de proyectos:** Se mantiene en Trello. En esta app los proyectos son solamente contenedores para agrupar ingresos y gastos.
- **Alertas de cobro:** Sistema nativo dentro de la app (no Google Calendar). Los cobros pendientes y vencidos se muestran de forma persistente en la interfaz.

---

## 2. Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 14+ (App Router) |
| Lenguaje | TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Base de datos | PostgreSQL (Vercel Postgres / Neon) |
| ORM | Prisma |
| Hosting | Vercel |
| Charts | Recharts |

**Autenticación:** Middleware de Next.js que verifica una cookie de sesión. Login = comparar input contra `APP_PASSWORD` (env var). Si coincide, setea cookie httpOnly. No hace falta JWT, OAuth ni base de usuarios.

---

## 3. Modelo de Datos (Prisma Schema)

### 3.1 Diagrama de Entidades

```
Client 1──N Project 1──N Income
                    1──N RecurringContract 1──N ScheduledPayment
                    1──N Expense (opcional, no todo gasto tiene proyecto)

ExpenseCategory 1──N Expense
SalaryWithdrawal (retiros por persona/mes, crean expense automáticamente)
DistributionConfig (capas 1 y 2, montos manuales)
```

### 3.2 Tablas

#### `clients`
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID | PK, default auto-generated |
| name | String | Unique. Ej: "PACSA", "COLEGIO" |
| notes | String? | Observaciones generales |
| created_at | DateTime | default now() |
| updated_at | DateTime | @updatedAt |

#### `projects`
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID | PK |
| client_id | UUID | FK → clients. ON DELETE RESTRICT |
| name | String | Ej: "Automatización WhatsApp" |
| status | Enum(`active`, `finished`, `cancelled`) | Default `active` |
| total_budget_usd | Decimal? | Monto total presupuestado. Opcional, sirve para calcular % cobrado |
| notes | String? | |
| created_at | DateTime | default now() |
| updated_at | DateTime | @updatedAt |

**Unique constraint:** `(client_id, name)` — no puede haber dos proyectos con el mismo nombre para el mismo cliente.

#### `incomes`
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID | PK |
| project_id | UUID | FK → projects. ON DELETE RESTRICT |
| date | Date | Fecha del cobro efectivo |
| amount_ars | Decimal? | Nullable. Se completa si el pago fue en pesos |
| amount_usd | Decimal | Siempre obligatorio. Es el valor canónico |
| exchange_rate | Decimal? | Tipo de cambio ARS/USD usado. Nullable (no aplica si pagó directo en USD) |
| type | Enum(`advance`, `final_payment`, `recurring`) | |
| notes | String? | Ej: "40% del total", "Pagado hasta Feb 2026" |
| created_at | DateTime | default now() |

**Lógica de carga ARS/USD:** Cuando el usuario ingresa un monto en ARS y un tipo de cambio, el sistema calcula automáticamente `amount_usd = amount_ars / exchange_rate`. El usuario puede también ingresar directamente en USD sin ARS.

#### `recurring_contracts`
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID | PK |
| project_id | UUID | FK → projects |
| description | String | Ej: "Mantenimiento mensual Sitio Web" |
| amount_usd | Decimal | Monto actual por período en USD |
| amount_ars | Decimal? | Equivalente referencial en ARS |
| frequency | Enum(`monthly`, `quarterly`, `biannual`, `annual`) | |
| start_date | Date | Primer cobro del contrato |
| end_date | Date? | Null = indefinido (se sigue generando) |
| is_active | Boolean | Default true. False = pausado, no genera más scheduled_payments |
| notes | String? | |
| created_at | DateTime | |
| updated_at | DateTime | |

**Campo computado (no en DB):** `next_due_date` se calcula desde el primer `scheduled_payment` con status `pending` de este contrato.

#### `scheduled_payments`
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID | PK |
| recurring_contract_id | UUID? | FK → recurring_contracts. Null = pago único programado (ej: segundo pago de un adelanto) |
| project_id | UUID | FK → projects |
| expected_date | Date | Fecha esperada de cobro |
| expected_amount_usd | Decimal | Monto esperado en USD |
| status | Enum(`pending`, `paid`, `overdue`, `cancelled`) | Default `pending` |
| actual_income_id | UUID? | FK → incomes. Se vincula cuando el pago se cobra efectivamente |
| notes | String? | |
| created_at | DateTime | |

**Lógicas clave:**
1. Al crear/editar un `recurring_contract`, el sistema genera `scheduled_payments` automáticamente para cada período entre `start_date` y `end_date` (o 12 meses futuros si `end_date` es null). Si ya existen pagos generados, solo agrega los faltantes.
2. Al actualizar `amount_usd` de un contrato, todos los `scheduled_payments` con status `pending` se actualizan al nuevo monto. Los `paid` y `cancelled` no se tocan.
3. Un cron job (o lógica en el endpoint `/api/alerts`) marca como `overdue` los pagos con `expected_date < hoy` y status `pending`.
4. "Marcar como cobrado" cambia el status a `paid` y vincula con un `income` existente o crea uno nuevo.

#### `expense_categories`
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID | PK |
| name | String | Unique. Ej: "Marketing", "Infra/Cloud" |
| is_default | Boolean | True para las precargadas. Las creadas por el usuario son false |

**Seed inicial:** Marketing, Herramientas/Software, Infra/Cloud, Hosting/Dominios, Email/Zoho, Publicidad (Ads), Sueldos/Honorarios, Contabilidad/Legal, Viajes/Viáticos, Prospección/Demos, Hardware, Otros.

#### `expenses`
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID | PK |
| date | Date | |
| category_id | UUID | FK → expense_categories |
| expense_type | Enum(`fixed`, `variable`) | |
| project_id | UUID? | FK → projects. Nullable: no todo gasto está asociado a un proyecto |
| amount_ars | Decimal? | |
| amount_usd | Decimal | Siempre obligatorio |
| exchange_rate | Decimal? | |
| description | String | Ej: "ChatGPT", "Monotributo", "Memoria RAM Tomas" |
| salary_withdrawal_id | UUID? | FK → salary_withdrawals. Si este gasto fue creado automáticamente por un retiro de salario |
| notes | String? | |
| created_at | DateTime | |

#### `distribution_config`
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID | PK |
| layer | Enum(`emergency`, `growth`) | Solo 2 filas en esta tabla |
| current_amount_usd | Decimal | Monto actualmente separado en esta capa |
| storage_location | String? | Ej: "Cocos Capital", "Naranja X" |
| updated_at | DateTime | |

**Lógica de Remanente (calculado, no almacenado):**
```
Resultado Neto = SUM(incomes.amount_usd) - SUM(expenses.amount_usd)
Remanente Disponible = Resultado Neto - Capa1.current_amount_usd - Capa2.current_amount_usd
```
Los salarios ya están incluidos en `expenses` (categoría "Sueldos/Honorarios"), por lo tanto ya restan del Resultado Neto. No se restan por separado.

El Remanente es siempre un valor acumulado histórico (no se filtra por período). Es la foto real de cuánto hay disponible ahora.

#### `salary_withdrawals`
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID | PK |
| person_name | String | Nombre de quien retira. Ej: "Tomas", "Socio 2" |
| month | Date | Primer día del mes al que corresponde. Ej: 2026-03-01 |
| amount_usd | Decimal | |
| amount_ars | Decimal? | |
| exchange_rate | Decimal? | |
| date | Date | Fecha efectiva del retiro |
| notes | String? | |
| created_at | DateTime | |

**Efecto secundario:** Al crear un `salary_withdrawal`, el sistema crea automáticamente un registro en `expenses` con: category = "Sueldos/Honorarios", expense_type = "fixed", amount_usd = el del retiro, description = "Salario {person_name} - {mes}", salary_withdrawal_id = id del retiro. Al eliminar el withdrawal, se elimina el expense asociado (cascade).

---

## 4. Estructura del Proyecto

```
broco-finance/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                    # Migración inicial desde el Excel
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Layout global: sidebar + header con alertas
│   │   ├── page.tsx               # Dashboard principal
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── clients/
│   │   │   ├── page.tsx           # Lista de clientes
│   │   │   └── [id]/
│   │   │       └── page.tsx       # Detalle: proyectos del cliente, historial
│   │   ├── projects/
│   │   │   ├── page.tsx           # Lista de proyectos con filtros
│   │   │   └── [id]/
│   │   │       └── page.tsx       # Detalle: ingresos, recurrentes, pagos programados
│   │   ├── incomes/
│   │   │   └── page.tsx           # CRUD ingresos con filtros
│   │   ├── expenses/
│   │   │   └── page.tsx           # CRUD gastos con filtros por categoría
│   │   ├── recurring/
│   │   │   └── page.tsx           # Contratos recurrentes + scheduled payments
│   │   ├── distribution/
│   │   │   └── page.tsx           # Capas + salarios + remanente
│   │   ├── calendar/
│   │   │   └── page.tsx           # Vista calendario de cobros
│   │   └── api/
│   │       ├── auth/
│   │       │   └── route.ts       # POST login, DELETE logout
│   │       ├── clients/
│   │       │   ├── route.ts       # GET list, POST create
│   │       │   └── [id]/
│   │       │       └── route.ts   # GET detail, PUT update, DELETE
│   │       ├── projects/
│   │       │   ├── route.ts
│   │       │   └── [id]/
│   │       │       └── route.ts
│   │       ├── incomes/
│   │       │   ├── route.ts
│   │       │   └── [id]/
│   │       │       └── route.ts
│   │       ├── expenses/
│   │       │   ├── route.ts
│   │       │   └── [id]/
│   │       │       └── route.ts
│   │       ├── expense-categories/
│   │       │   └── route.ts       # GET list, POST create
│   │       ├── recurring/
│   │       │   ├── route.ts
│   │       │   └── [id]/
│   │       │       └── route.ts
│   │       ├── scheduled-payments/
│   │       │   ├── route.ts       # GET list (filtros: status, from, to)
│   │       │   └── [id]/
│   │       │       └── route.ts   # PUT mark as paid / cancel / update
│   │       ├── distribution/
│   │       │   └── route.ts       # GET config + remanente calculado, PUT update capas
│   │       ├── salary/
│   │       │   ├── route.ts       # GET list (filtros: month, person), POST create
│   │       │   └── [id]/
│   │       │       └── route.ts   # DELETE (cascade elimina expense asociado)
│   │       ├── alerts/
│   │       │   └── route.ts       # GET: pagos overdue + próximos 7 días
│   │       └── dashboard/
│   │           └── route.ts       # GET datos agregados (query: from, to, clientId, projectId)
│   ├── components/
│   │   ├── ui/                    # shadcn/ui (Button, Input, Select, Dialog, Table, Card, etc.)
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx        # Navegación principal
│   │   │   ├── Header.tsx         # Incluye AlertBanner
│   │   │   ├── AlertBanner.tsx    # Banner persistente: "3 cobros vencidos, 2 próximos esta semana"
│   │   │   └── DateRangeFilter.tsx
│   │   ├── dashboard/
│   │   │   ├── KPICards.tsx       # Ingresos, Egresos, Neto, Remanente
│   │   │   ├── SecondaryKPIs.tsx  # Por Cobrar, Vencidos, Salarios del mes
│   │   │   ├── IncomeExpenseChart.tsx  # Barras agrupadas por mes
│   │   │   ├── CategoryBreakdown.tsx   # Donut gastos por categoría
│   │   │   ├── ProfitabilityChart.tsx  # Línea de rentabilidad mensual
│   │   │   ├── CashFlowChart.tsx       # Área de cash flow acumulado
│   │   │   ├── DistributionBar.tsx     # Barra horizontal segmentada (capas + remanente)
│   │   │   ├── UpcomingPayments.tsx    # Tabla próximos cobros con semáforo
│   │   │   └── TopClients.tsx          # Ranking clientes por ingreso
│   │   ├── forms/
│   │   │   ├── IncomeForm.tsx
│   │   │   ├── ExpenseForm.tsx
│   │   │   ├── RecurringContractForm.tsx
│   │   │   └── SalaryForm.tsx
│   │   └── tables/
│   │       ├── DataTable.tsx      # Tabla genérica reutilizable (sorting, pagination, filtros)
│   │       ├── IncomesTable.tsx
│   │       ├── ExpensesTable.tsx
│   │       └── PaymentsTable.tsx
│   ├── lib/
│   │   ├── prisma.ts              # Singleton del Prisma client
│   │   ├── auth.ts                # Funciones de login/logout/verificar cookie
│   │   ├── utils.ts               # Formateo USD, fechas, helpers
│   │   └── calculations.ts        # Funciones: calcularRemanente(), calcularResultadoNeto()
│   └── middleware.ts              # Protege todas las rutas excepto /login
├── public/
├── .env.local
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.js
```

---

## 5. Funcionalidades por Pantalla

### 5.1 Dashboard (`/`)

Pantalla principal. Visión ejecutiva del estado financiero.

**Barra de filtros (sticky en top, debajo del header):**
- Rango de fechas con presets: Este mes | Mes anterior | Último trimestre | Este año | Últimos 12 meses | Personalizado (date picker doble)
- Filtro por cliente (dropdown multi-select)
- Filtro por proyecto (dropdown multi-select, opciones se filtran según cliente seleccionado)
- Botón "Limpiar filtros"
- Los filtros aplican a todos los gráficos y tablas EXCEPTO al Remanente Disponible (que es siempre acumulado histórico)

**Fila 1 — KPI Cards principales (4 tarjetas en grilla):**

| Tarjeta | Valor | Detalle |
|---|---|---|
| Total Ingresos | SUM incomes.amount_usd en período | Badge con % variación vs período anterior. Verde si sube, rojo si baja |
| Total Egresos | SUM expenses.amount_usd en período | Ídem variación |
| Resultado Neto | Ingresos - Egresos del período | Verde si positivo, rojo si negativo |
| Remanente Disponible | Resultado Neto Histórico - Capa1 - Capa2 | **No se filtra por fechas.** Siempre muestra el real actual. Es el indicador para decidir salarios |

**Fila 2 — KPI Cards secundarias (3 tarjetas):**

| Tarjeta | Valor | Detalle |
|---|---|---|
| Por Cobrar | SUM scheduled_payments.expected_amount_usd WHERE status=pending | Cantidad de pagos entre paréntesis |
| Cobros Vencidos | SUM WHERE status=overdue | Rojo si > 0. Click abre vista filtrada |
| Salarios del Mes | SUM salary_withdrawals WHERE month=mes_actual | Desglose por persona visible en tooltip |

**Fila 3 — Gráficos principales (2 columnas, 60/40):**

- **Izquierda (60%):** Ingresos vs Egresos por mes. `BarChart` de Recharts con 2 barras agrupadas por mes (verde=ingresos, rojo=egresos) + `Line` superpuesta para resultado neto. Tooltip con desglose al hover.
- **Derecha (40%):** Desglose de Gastos por Categoría. `PieChart` donut. Leyenda lateral con nombre de categoría + monto USD + porcentaje. Click en segmento → navega a `/expenses?category=X`.

**Fila 4 — Gráficos secundarios (2 columnas, 50/50):**

- **Izquierda:** Rentabilidad Mensual. `AreaChart` de resultado neto mes a mes. Área verde cuando > 0, roja cuando < 0.
- **Derecha:** Cash Flow Acumulado. `AreaChart` con la suma acumulada de (ingresos - egresos) a lo largo del tiempo.

**Fila 5 — Distribución por Capas (ancho completo):**

Barra horizontal segmentada tipo stacked bar mostrando visualmente:
- Segmento 1: Capa 1 Emergencia → "USD 2,000 — Cocos Capital"
- Segmento 2: Capa 2 Crecimiento → "USD 4,000 — Naranja X"
- Segmento 3: Remanente Disponible → destacado en color principal, monto grande
- Debajo: texto "Tenés USD X disponibles para distribuir"

**Fila 6 — Pagos Próximos (tabla, ancho completo):**

Tabla con los próximos 10 `scheduled_payments` ordenados por `expected_date ASC`:
- Columnas: Fecha | Cliente | Proyecto | Monto USD | Estado
- Color de fila: verde (paid) | azul (pending, >7 días) | amarillo (pending, ≤7 días) | rojo (overdue)
- Botón "Ver calendario completo" → navega a `/calendar`

**Fila 7 — Top Clientes (tabla compacta):**

Top 5 clientes por ingreso en el período seleccionado:
- Columnas: Cliente | Total Ingresos | Proyectos Activos | Pagos Pendientes
- Link "Ver todos" → navega a `/clients`

### 5.2 Clientes (`/clients`)

- Listado con buscador por nombre
- Cada fila muestra: nombre, total facturado (USD), total por cobrar (scheduled_payments pending), cantidad proyectos activos
- Click en fila → `/clients/[id]`
- Botón "Nuevo Cliente" abre modal con formulario (nombre, notas)
- Editar/eliminar desde la fila (eliminar solo si no tiene proyectos asociados)

**Detalle de cliente (`/clients/[id]`):**
- Header con nombre + métricas: total facturado, total por cobrar, proyectos activos/totales
- Tabla de proyectos del cliente (con status, presupuesto, % cobrado)
- Tabla de últimos ingresos del cliente
- Tabla de pagos programados pendientes del cliente

### 5.3 Proyectos (`/projects`)

- Listado filtrable por: estado (Activo/Finalizado/Cancelado), cliente
- Cada fila: nombre, cliente, estado, presupuesto, cobrado/presupuesto, próximo cobro
- Botón "Nuevo Proyecto" → modal (seleccionar cliente, nombre, presupuesto opcional, notas)

**Detalle de proyecto (`/projects/[id]`):**
- Header: nombre, cliente (link), estado, presupuesto total
- Barra de progreso: % cobrado del presupuesto (si tiene presupuesto definido)
- Tab 1 — Ingresos: tabla de todos los ingresos del proyecto
- Tab 2 — Contratos Recurrentes: lista de recurring_contracts asociados
- Tab 3 — Pagos Programados: timeline de scheduled_payments con estados
- Tab 4 — Gastos: gastos vinculados a este proyecto

### 5.4 Ingresos (`/incomes`)

- Tabla paginada con filtros: rango de fechas, cliente, proyecto, tipo (Adelanto/Pago final/Recurrente)
- Columnas visibles: Fecha | Cliente | Proyecto | Monto ARS | Monto USD | TC | Tipo | Notas
- Totales en footer según filtros: Total USD, Total ARS
- Botón "Nuevo Ingreso" → modal/drawer con formulario:
  - Seleccionar cliente → se carga lista de proyectos de ese cliente
  - Fecha, Tipo de ingreso
  - Monto ARS (opcional) + Tipo de cambio (opcional) → calcula USD automáticamente
  - O directamente Monto USD
  - Notas
- Edición inline o en modal. Eliminación con confirmación.

### 5.5 Gastos (`/expenses`)

- Tabla paginada con filtros: rango de fechas, categoría, tipo (Fijo/Variable), proyecto
- Columnas: Fecha | Categoría | Tipo | Descripción | Proyecto | Monto ARS | Monto USD | TC
- Sección superior con resumen: total fijos, total variables, total general. Desglose por categoría colapsable.
- Botón "Nuevo Gasto" → modal con formulario:
  - Fecha, Categoría (select con opción "Crear nueva categoría"), Tipo fijo/variable
  - Proyecto asociado (opcional, dropdown)
  - Montos ARS/USD + TC (misma lógica que ingresos)
  - Descripción, Notas
- Edición y eliminación. Los gastos creados automáticamente por salary_withdrawals se muestran con badge "Salario" y no se pueden editar directamente (se editan desde `/distribution`).

### 5.6 Contratos Recurrentes (`/recurring`)

- Tabla con todos los contratos. Filtros: activo/inactivo, cliente, proyecto
- Columnas: Cliente | Proyecto | Descripción | Monto USD | Frecuencia | Próximo Cobro | Estado
- Botón "Nuevo Contrato" → formulario:
  - Seleccionar proyecto (que ya trae el cliente)
  - Descripción, Monto USD, Monto ARS referencial, Frecuencia
  - Fecha inicio, Fecha fin (opcional)
  - Al guardar: se generan los scheduled_payments automáticamente
- **Editar contrato:** Si se cambia el monto, popup de confirmación: "¿Actualizar también los X pagos pendientes al nuevo monto?" (Sí/No)
- **Vista expandida de cada contrato:** muestra sus scheduled_payments como timeline:
  - Cada pago con fecha, monto, status (con color)
  - Botón "Marcar como cobrado" → abre modal para vincular con un ingreso existente o crear uno nuevo
  - Botón "Cancelar pago" → cambia status a cancelled

### 5.7 Distribución y Salarios (`/distribution`)

**Sección 1 — Remanente (hero section, prominente):**
- Número grande: **"Remanente Disponible: USD X,XXX.XX"**
- Desglose debajo en texto:
  ```
  Ingresos Acumulados:    USD XX,XXX.XX
  - Egresos Acumulados:   USD  X,XXX.XX
  = Resultado Neto:       USD XX,XXX.XX
  - Capa 1 (Emergencia):  USD  2,000.00
  - Capa 2 (Crecimiento): USD  4,000.00
  = Remanente Disponible: USD XX,XXX.XX
  ```
- Este número se actualiza en tiempo real cuando se modifican capas o se agregan salarios.

**Sección 2 — Capas:**
- Card para cada capa con: nombre, monto actual (editable inline), ubicación (editable), botón guardar
- Al modificar un monto, el remanente de arriba se recalcula instantáneamente en pantalla

**Sección 3 — Salarios:**
- Selector de mes (dropdown, default: mes actual)
- Arriba del formulario: "Remanente actual: USD X,XXX.XX" como referencia para decidir cuánto retirar
- Tabla de retiros del mes seleccionado: Persona | Monto USD | Monto ARS | TC | Fecha | Notas | Acciones
- Total retirado en el mes
- Botón "Registrar Retiro" → formulario: persona (input texto con autocomplete de nombres previos), monto, fecha, notas
  - Al guardar: crea el salary_withdrawal Y el expense asociado automáticamente
  - El remanente se actualiza al instante
- Indicador: "Después de estos retiros, el remanente queda en: USD X,XXX.XX"
- Sección colapsable: "Historial por persona" → tabla agrupada por nombre con totales

### 5.8 Calendario de Cobros (`/calendar`)

- Vista de calendario mensual (grid). Navegación mes anterior / mes siguiente
- Cada día muestra los scheduled_payments de esa fecha como chips coloreados:
  - Azul: pendiente (>7 días)
  - Amarillo: pendiente (≤7 días)
  - Rojo: vencido (overdue)
  - Verde: cobrado (paid)
  - Gris: cancelado
- Click en chip → popup con detalle: Cliente, Proyecto, Monto esperado, Estado, Notas
  - Botón "Marcar como cobrado" (si pending/overdue)
  - Botón "Cancelar" (si pending)
- Vista de lista alternativa (toggle): tabla cronológica con los mismos datos
- Filtros: cliente, proyecto, status

### 5.9 Sistema de Alertas (nativo)

**AlertBanner en Header (visible en TODAS las pantallas):**
- Se renderiza en `layout.tsx`, dentro del `Header.tsx`
- Consulta `/api/alerts` al cargar la app (y cada 5 minutos con polling o al navegar)
- Muestra un banner compacto tipo: "⚠️ 2 cobros vencidos · 3 cobros en los próximos 7 días"
- Colores: rojo si hay vencidos, amarillo si solo hay próximos, no se muestra si todo está al día
- Click en el banner → navega a `/calendar` filtrado por pendientes/vencidos

**Endpoint `/api/alerts`:**
- Primero: ejecuta lógica de marcado automático → UPDATE scheduled_payments SET status='overdue' WHERE status='pending' AND expected_date < TODAY
- Luego retorna:
  ```json
  {
    "overdue": { "count": 2, "total_usd": 1500.00, "items": [...] },
    "upcoming_7_days": { "count": 3, "total_usd": 2800.00, "items": [...] },
    "upcoming_30_days": { "count": 5, "total_usd": 4200.00, "items": [...] }
  }
  ```
- Cada item incluye: id, expected_date, client_name, project_name, expected_amount_usd

---

## 6. API Routes — Referencia Completa

| Método | Ruta | Descripción | Query params |
|---|---|---|---|
| POST | `/api/auth` | Login (compara contra APP_PASSWORD, setea cookie) | — |
| DELETE | `/api/auth` | Logout (borra cookie) | — |
| GET | `/api/clients` | Listar clientes | `?search=` |
| POST | `/api/clients` | Crear cliente | — |
| GET | `/api/clients/[id]` | Detalle cliente + métricas | — |
| PUT | `/api/clients/[id]` | Editar cliente | — |
| DELETE | `/api/clients/[id]` | Eliminar cliente (falla si tiene proyectos) | — |
| GET | `/api/projects` | Listar proyectos | `?clientId=&status=` |
| POST | `/api/projects` | Crear proyecto | — |
| GET | `/api/projects/[id]` | Detalle proyecto + ingresos + recurrentes + pagos | — |
| PUT | `/api/projects/[id]` | Editar proyecto | — |
| DELETE | `/api/projects/[id]` | Eliminar proyecto (falla si tiene ingresos/gastos) | — |
| GET | `/api/incomes` | Listar ingresos | `?projectId=&clientId=&type=&from=&to=` |
| POST | `/api/incomes` | Crear ingreso | — |
| PUT | `/api/incomes/[id]` | Editar ingreso | — |
| DELETE | `/api/incomes/[id]` | Eliminar ingreso | — |
| GET | `/api/expenses` | Listar gastos | `?categoryId=&type=&projectId=&from=&to=` |
| POST | `/api/expenses` | Crear gasto | — |
| PUT | `/api/expenses/[id]` | Editar gasto (falla si es de salary) | — |
| DELETE | `/api/expenses/[id]` | Eliminar gasto (falla si es de salary) | — |
| GET | `/api/expense-categories` | Listar categorías | — |
| POST | `/api/expense-categories` | Crear categoría nueva | — |
| GET | `/api/recurring` | Listar contratos recurrentes | `?clientId=&projectId=&active=` |
| POST | `/api/recurring` | Crear contrato + generar scheduled_payments | — |
| PUT | `/api/recurring/[id]` | Editar contrato. Body incluye `update_pending_payments: boolean` | — |
| GET | `/api/scheduled-payments` | Listar pagos programados | `?status=&from=&to=&clientId=&projectId=` |
| PUT | `/api/scheduled-payments/[id]` | Actualizar (marcar paid, cancel, editar monto/fecha) | — |
| GET | `/api/distribution` | Config capas + remanente calculado | — |
| PUT | `/api/distribution` | Actualizar montos de capas | — |
| GET | `/api/salary` | Listar retiros | `?month=&person=` |
| POST | `/api/salary` | Crear retiro + crear expense asociado automáticamente | — |
| DELETE | `/api/salary/[id]` | Eliminar retiro + eliminar expense asociado | — |
| GET | `/api/alerts` | Cobros vencidos + próximos 7 y 30 días | — |
| GET | `/api/dashboard` | Datos agregados para dashboard | `?from=&to=&clientId=&projectId=` |

---

## 7. Migración de Datos

Script en `prisma/seed.ts` que parsea el Excel actual y puebla la base de datos.

**Mapeo de hojas a tablas:**

| Origen (Excel) | Destino (DB) | Lógica |
|---|---|---|
| Hoja "Ingresos", columna "Cliente" | `clients` | Deduplicar por nombre: PACSA, COIRINI, COLEGIO, FAUFENA, BERTINO, RASAFERTIL, UN TOQUE DE AMOR, Nico Oliveto |
| Hoja "Ingresos", columnas "Proyecto" + "Cliente" | `projects` | Deduplicar por (client_id, name). Status mapeado de "Estado del proyecto": Activo→active, Finalizado→finished, Cancelado→cancelled |
| Hoja "Ingresos", cada fila | `incomes` | Mapeo directo. Tipo: Adelanto→advance, Pago final→final_payment, Recurrente→recurring |
| Hoja "Gastos", columna "Categoría" | `expense_categories` | Deduplicar. is_default = true |
| Hoja "Gastos", cada fila | `expenses` | Mapeo directo. expense_type: Fijo→fixed, Variable→variable |
| Hoja "Distribución", filas Capa 1/2 | `distribution_config` | 2 registros con montos y ubicaciones |
| Hoja "Ingresos" tipo "Recurrente" | `recurring_contracts` | Agrupar por (proyecto, descripción similar). Inferir frecuencia y fechas. Generar scheduled_payments futuros |

**Pasos del seed:**
1. Leer XLSX con la librería `xlsx` (SheetJS)
2. Insertar clientes (deduplicados)
3. Insertar proyectos (deduplicados, asociados a clientes)
4. Insertar categorías de gasto (deduplicadas)
5. Insertar todos los ingresos
6. Insertar todos los gastos
7. Insertar config de distribución (capas 1 y 2)
8. Agrupar ingresos recurrentes → crear recurring_contracts
9. Para cada contrato activo, generar scheduled_payments futuros (12 meses desde hoy)
10. Log final con conteo de registros insertados por tabla

---

## 8. Fases de Implementación

### Fase 1 — MVP: CRUD Base + Migración
**Objetivo:** Tener la app funcional con los mismos datos del Excel, poder cargar y consultar ingresos/gastos.

| # | Tarea | Detalle |
|---|---|---|
| 1.1 | Setup proyecto | `create-next-app`, Prisma, Tailwind, shadcn/ui |
| 1.2 | Schema Prisma | Todas las tablas de sección 3. Ejecutar migrate |
| 1.3 | Auth simple | Middleware + página login + cookie. `APP_PASSWORD` en env |
| 1.4 | Layout global | Sidebar con navegación, Header (sin alertas aún) |
| 1.5 | CRUD Clientes | Página lista + detalle + formulario crear/editar |
| 1.6 | CRUD Proyectos | Lista con filtro por cliente/estado + detalle + formulario |
| 1.7 | CRUD Ingresos | Tabla con filtros + formulario con lógica ARS/USD/TC |
| 1.8 | CRUD Gastos | Tabla con filtros + categorías + formulario. Crear categoría nueva inline |
| 1.9 | Seed script | Migración completa desde Excel. Validar datos post-seed |
| 1.10 | Deploy inicial | Vercel + Vercel Postgres. Variables de entorno. Verificar funcionamiento |

### Fase 2 — Recurrentes, Distribución y Alertas
**Objetivo:** Gestión inteligente de cobros recurrentes, sistema de capas/salarios, y alertas nativas.

| # | Tarea | Detalle |
|---|---|---|
| 2.1 | CRUD Contratos Recurrentes | Formulario + lista. Al guardar, generar scheduled_payments |
| 2.2 | Generación automática de pagos | Lógica que crea scheduled_payments según frecuencia y rango |
| 2.3 | Actualización de precios | Al editar monto del contrato, propagar a pagos pendientes (con confirmación) |
| 2.4 | Flujo "marcar como cobrado" | Vincular scheduled_payment con income existente o crear income nuevo |
| 2.5 | Pantalla Distribución | Sección remanente (hero) + capas editables + cálculo en tiempo real |
| 2.6 | CRUD Salarios | Formulario por persona/mes. Crear expense automáticamente. Recalcular remanente |
| 2.7 | Vista Calendario | Grid mensual + chips coloreados + popup de detalle + acciones |
| 2.8 | Sistema de Alertas | Endpoint `/api/alerts` + componente AlertBanner en header + marcado automático de overdue |

### Fase 3 — Dashboard
**Objetivo:** Visión ejecutiva con indicadores, gráficos y filtros.

| # | Tarea | Detalle |
|---|---|---|
| 3.1 | Endpoint dashboard | `/api/dashboard` con totales, variaciones, agregados por mes |
| 3.2 | Barra de filtros | DateRangePicker con presets + filtros cliente/proyecto. Estado compartido |
| 3.3 | KPI Cards principales | Ingresos, Egresos, Neto (filtrados) + Remanente (histórico). Con variación % |
| 3.4 | KPI Cards secundarias | Por Cobrar, Vencidos, Salarios del mes |
| 3.5 | Gráfico barras Ing/Egr | Recharts BarChart agrupado + Line de neto superpuesta |
| 3.6 | Donut gastos por categoría | PieChart interactivo con leyenda y click-to-filter |
| 3.7 | Gráfico rentabilidad | AreaChart con colores condicionales (verde/rojo) |
| 3.8 | Gráfico cash flow | AreaChart acumulado |
| 3.9 | Barra distribución | Stacked horizontal bar con capas + remanente |
| 3.10 | Tabla pagos próximos | Top 10 con semáforo de colores |
| 3.11 | Tabla top clientes | Ranking por ingreso en período |

### Fase 4 — Polish y Extras
**Objetivo:** Refinamiento de UX y funcionalidades complementarias.

| # | Tarea | Detalle |
|---|---|---|
| 4.1 | UX improvements | Toast notifications (sonner), confirmaciones de eliminación, loading skeletons |
| 4.2 | Responsive | Sidebar colapsable, tablas scrolleables, layout mobile-friendly |
| 4.3 | Export datos | Botón "Exportar a CSV" en cada tabla filtrada |
| 4.4 | Búsqueda global | Command palette (⌘K) para buscar clientes, proyectos, ingresos rápidamente |
| 4.5 | Detalle proyecto mejorado | Tabs con ingresos, gastos, recurrentes, pagos. Barra de progreso % cobrado |

---

## 9. Variables de Entorno

```env
# Base de datos (Vercel Postgres / Neon)
DATABASE_URL="postgresql://..."

# Auth simple — contraseña compartida para los 2 dueños
APP_PASSWORD="contraseña_segura_aqui"
```

---

## 10. Comandos de Setup

```bash
# 1. Crear proyecto
npx create-next-app@latest broco-finance --typescript --tailwind --eslint --app --src-dir
cd broco-finance

# 2. Dependencias core
npm install prisma @prisma/client
npm install recharts
npm install xlsx                    # Para seed/migración
npm install date-fns                # Manejo de fechas
npx shadcn@latest init

# 3. Componentes shadcn necesarios
npx shadcn@latest add button input label select dialog card table tabs badge dropdown-menu popover calendar command toast

# 4. Prisma setup
npx prisma init
# → Copiar schema de sección 3 a prisma/schema.prisma
# → Configurar DATABASE_URL en .env
npx prisma migrate dev --name init
npx prisma db seed

# 5. Deploy
vercel
vercel env add DATABASE_URL
vercel env add APP_PASSWORD
```

---

## 11. Decisiones Técnicas Clave

1. **USD como moneda canónica.** Todos los cálculos operan sobre `amount_usd`. Los campos ARS y exchange_rate son auxiliares de registro.
2. **Tipo de cambio manual.** El usuario carga el TC al registrar una operación en ARS. No se consulta API externa.
3. **Auth minimalista.** Password en env var + cookie httpOnly. Sin usuarios, sin JWT, sin OAuth. Middleware protege todo excepto `/login`.
4. **Proyectos = contenedores.** No gestionan tareas (eso vive en Trello). Solo agrupan ingresos y gastos.
5. **Remanente = Resultado Neto Histórico - Capas.** Los salarios son egresos (categoría "Sueldos/Honorarios") y ya se descuentan del Resultado Neto. No se restan doblemente.
6. **Salarios crean expenses automáticamente.** Un salary_withdrawal genera un expense vinculado. Eliminar el withdrawal elimina el expense (cascade lógico).
7. **Alertas nativas, no Google Calendar.** Un AlertBanner persistente en header + endpoint de alertas + marcado automático de overdue. Los cobros vencidos escalan visualmente y nunca se pierden de vista.
8. **Scheduled payments como fuente de verdad.** Se generan automáticamente desde contratos recurrentes pero son editables individualmente (cambiar fecha, monto, cancelar).
9. **Vercel Postgres (Neon).** Incluido en el plan de Vercel. Sin infraestructura separada.
10. **DataTable reutilizable.** Un componente genérico de tabla con sorting, paginación y filtros, usado en todas las vistas de listado.
