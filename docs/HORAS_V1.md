# Tiempos v1

## Alcance

El módulo independiente `/hours`, presentado en la interfaz como **Tiempos**,
permite registrar minutos normalizados por persona, cliente y proyecto,
consultar registros, reportar horas registradas y exportar el detalle filtrado
a CSV. `/hours/team` es exclusivo de administradores y contiene únicamente
asignaciones usuario → proyecto. Las anulaciones son lógicas y dejan auditoría.

Los colaboradores solo ven Tiempos > Registros, con sus indicadores, filtros y
registros propios; registran únicamente en proyectos activos asignados. Los
administradores conservan la aplicación financiera y pueden registrar para sí
mismos o para otra persona, siempre en proyectos activos y sin requerir una
asignación. El portal `/p` y el MCP mantienen autenticación y permisos
independientes.

La gestión de identidad es global en `/users` y exclusiva de administradores:
nombre, correo, rol, estado, activación y edición básica de la cuenta. Horas
mantiene `/hours/team` únicamente para asignar proyectos a colaboradores; los
clientes se derivan de esos proyectos existentes.

## Decisiones

- Auth.js/NextAuth con Credentials y sesión JWT de 12 horas. La cuenta activa, rol y versión de sesión se vuelven a consultar en servidor; desactivar o cambiar el rol incrementa la versión y bloquea el acceso en el siguiente request. Middleware es navegación temprana; las lecturas y mutaciones administrativas verifican rol en servidor. No se acepta `broco_session` ni clave compartida.
- `bcryptjs` hashea contraseñas; los enlaces de activación son tokens aleatorios, almacenados solo como SHA-256, de un uso y con vencimiento de 24 horas. Emitir uno nuevo revoca los anteriores; reclamarlo, activar la cuenta e invalidar el resto sucede atómicamente. El token en claro no se persiste ni se registra.
- La suma diaria se valida dentro de una transacción Serializable con lock advisory por persona/fecha. El máximo es 1440 minutos. La fecha operativa usa `America/Argentina/Cordoba`, se valida como fecha calendario real y las correcciones usan control de versión para no sobrescribir cambios concurrentes.
- `TimeEntry` separa la persona que trabajó (`userId`) de quien cargó o corrigió (`createdById`/`modifiedById`) y conserva auditoría before/after.

## Acceso inicial

No se crean cuentas reales en el repositorio. En una base local dedicada, después de aplicar el esquema, usar variables temporales fuera de Git y ejecutar:

```bash
ALLOW_ADMIN_BOOTSTRAP=true ADMIN_BOOTSTRAP_NAME='Administrador inicial' ADMIN_BOOTSTRAP_EMAIL='admin@example.invalid' ADMIN_BOOTSTRAP_PASSWORD='(secreto local de 12+ caracteres)' pnpm exec tsx scripts/bootstrap-admin.ts
```

En Equipo, el administrador crea una persona pendiente y genera un enlace seguro. Debe compartirlo por un canal privado; el enlace vence en 24 horas y solo puede utilizarse una vez.

## Base de datos

En local/test verificar primero que `DATABASE_URL` apunta a la base dedicada de pruebas (`localhost:5434`) y nunca a un host remoto. Luego ejecutar `pnpm exec prisma db push` o aplicar la migración `prisma/migrations/20260927090000_add_hours_auth/migration.sql` en la base local. No ejecutar `prisma migrate deploy` ni DDL contra producción desde este cambio.

Para producción queda pendiente un runner controlado con pre-checks, una sentencia por llamada al proxy de Prisma Accelerate, backup/verificación y ventana aprobada. También deben configurarse `AUTH_SECRET` y las variables del bootstrap solo durante la operación inicial; no se documentan sus valores.

La definición de migración ya declara los índices operativos de usuarios, tokens de acceso, asignaciones y auditorías de horas; el runner futuro debe verificarlos explícitamente. El límite de intentos de login requiere un mecanismo durable compatible con el despliegue y queda pendiente de una tanda de hardening: no se incorporó un limiter efímero en memoria.

## Pruebas locales

1. Levantar PostgreSQL dedicado con `docker compose -f docker-compose.test.yml up -d`.
2. Confirmar que `.env.test` usa PostgreSQL en `localhost:5434`; no imprimir la URL.
3. Aplicar el esquema con `set -a; source .env.test; set +a; DATABASE_URL="$DATABASE_URL_TEST" pnpm exec prisma db push --skip-generate`.
4. Preparar las tres identidades y proyectos con `HOURS_TEST_PASSWORD` temporal:
   `set -a; source .env.test; set +a; HOURS_TEST_PASSWORD='(secreto temporal)' pnpm seed:hours:test`.
5. Para navegador, iniciar el servidor apuntando explícitamente a `DATABASE_URL_TEST`, con `AUTH_SECRET` temporal y `PORT=3299`.
6. Ejecutar `pnpm exec vitest run tests/integration/hours.test.ts` y `pnpm test:e2e`. El E2E usa login real de Auth.js, no cookies compartidas.
7. Verificar activación, carga con minutos/horas y coma/punto, cambio de unidad, límite de 24 horas, asignación incorrecta, fechas futuras, filtros, CSV, corrección, anulación e historial.

Para preparar las tres identidades y dos proyectos de prueba sin guardar contraseñas, usar una variable temporal:

```bash
DATABASE_URL_TEST='<solo la URL local de .env.test>' HOURS_TEST_PASSWORD='(secreto temporal de 12+ caracteres)' pnpm seed:hours:test
```

El script rechaza cualquier host distinto de `localhost:5434` y no imprime la contraseña.

## Resultado de la validación de esta tanda

- `tests/integration/hours.test.ts`: 5/5 PASS, incluyendo IDOR, idempotencia,
  límite diario, corrección administrativa, anulación, auditoría y protección
  de proyectos con horas.
- `pnpm test:e2e`: 24/24 PASS con administrador y dos colaboradores de test;
  se migraron los escenarios legacy a login real.
- En la navegación actual, ADMIN dispone de Tiempos > Registros, Reportes y
  Asignaciones; COLLABORATOR dispone únicamente de Tiempos > Registros, con
  KPIs y filtros personales dentro de la misma pantalla.
- Verificación visual Playwright: `/login`, `/hours`, `/hours/reports` y
  `/hours/team` en escritorio y móvil, sin errores de consola observados.
  La CLI `agent-browser` no está instalada en este entorno; se usó Playwright
  directamente como fallback.
- La baseline de tests se mantiene verde; no se acepta una baseline roja para
  publicar Tiempos.

## Preparación para producción

La migración `prisma/migrations/20260927090000_add_hours_auth/migration.sql`
es el registro de esquema para revisión. No se ejecutó fuera de PostgreSQL
local/test. Antes de producción se necesita un runner controlado que:

- haga prechecks de tablas/columnas/filas inesperadas y aborte ante cualquier
  estado no previsto;
- ejecute DDL de a una sentencia por llamada al proxy de Prisma Accelerate;
- sea idempotente, registre solo resultados no sensibles y no haga seed;
- tenga backup/verificación previa, ventana aprobada y rollback lógico;
- valide una segunda ejecución segura y los índices/constraints resultantes.

Variables previstas: `AUTH_SECRET`, más las variables ya existentes del portal
(`PROJECT_SHARE_ENCRYPTION_KEY` y `PROJECT_SHARE_SESSION_SECRET`). Las
variables `ALLOW_ADMIN_BOOTSTRAP`, `ADMIN_BOOTSTRAP_NAME`,
`ADMIN_BOOTSTRAP_EMAIL` y `ADMIN_BOOTSTRAP_PASSWORD` solo se usan durante el
bootstrap inicial controlado y no deben quedar configuradas permanentemente.
La activación se entrega manualmente; no hay envío de correo en V1.

Antes de publicar todavía falta ejecutar ese procedimiento de migración y
validación en un entorno productivo controlado, crear cuentas reales fuera de
Git y acordar el canal privado para los enlaces de activación. Esta tanda no
hizo push, deploy, DDL remoto ni creó credenciales reales.
