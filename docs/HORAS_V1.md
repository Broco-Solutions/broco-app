# Tiempos v1

## Alcance

El módulo independiente `/hours`, presentado en la interfaz como **Tiempos**,
permite registrar minutos normalizados por persona, cliente y proyecto,
consultar registros, reportar horas registradas y exportar el detalle filtrado
a CSV. El acceso usuario → proyecto se administra en Administración > Usuarios
y es compartido por Tiempos y Tareas Operativas. Las anulaciones son lógicas y
dejan auditoría.

Los colaboradores solo ven Tiempos > Registros, con sus indicadores, filtros y
registros propios; registran únicamente en proyectos activos asignados. Los
administradores conservan la aplicación financiera y pueden registrar para sí
mismos o para otra persona, siempre en proyectos activos y sin requerir una
asignación. El portal `/p` y el MCP mantienen autenticación y permisos
independientes.

La gestión de identidad es global en `/users` y exclusiva de administradores:
nombre, correo, rol, estado, activación, edición básica de la cuenta y acceso a
proyectos por colaborador. Los clientes se derivan de esos proyectos existentes.

## Decisiones

- Auth.js/NextAuth con Credentials y sesión JWT de 30 días. La cuenta activa, rol y versión de sesión se vuelven a consultar en servidor; desactivar o cambiar el rol incrementa la versión y bloquea el acceso en el siguiente request. Middleware es navegación temprana; las lecturas y mutaciones administrativas verifican rol en servidor. No se acepta `broco_session` ni clave compartida.
- `bcryptjs` hashea contraseñas; los enlaces de activación son tokens aleatorios, almacenados solo como SHA-256, de un uso y con vencimiento de 24 horas. Emitir uno nuevo revoca los anteriores; reclamarlo, activar la cuenta e invalidar el resto sucede atómicamente. El token en claro no se persiste ni se registra.
- La suma diaria se valida dentro de una transacción Serializable con lock advisory por persona/fecha. El máximo es 1440 minutos. La fecha operativa usa `America/Argentina/Cordoba`, se valida como fecha calendario real y las correcciones usan control de versión para no sobrescribir cambios concurrentes.
- `TimeEntry` separa la persona que trabajó (`userId`) de quien cargó o corrigió (`createdById`/`modifiedById`) y conserva auditoría before/after.
- La carga y corrección manual usan campos enteros `Horas` (0–24) y `Minutos` (0–59). Ambos pueden quedar vacíos como cero; el total debe estar entre 1 y 1440 minutos. La base conserva únicamente `TimeEntry.minutes`.

## Acceso inicial

No se crean cuentas reales en el repositorio. En una base local dedicada, después de aplicar el esquema, usar variables temporales fuera de Git y ejecutar:

```bash
NODE_ENV=test ALLOW_LOCAL_BOOTSTRAP_TEST=true ALLOW_ADMIN_BOOTSTRAP=true DATABASE_URL_TEST='(solo localhost:5434/broco_finance_test)' ADMIN_BOOTSTRAP_NAME='Administrador inicial' ADMIN_BOOTSTRAP_EMAIL='admin@example.invalid' ADMIN_BOOTSTRAP_PASSWORD='(secreto local de 12+ caracteres)' pnpm bootstrap:admin
```

El script rechaza cualquier destino local que no sea la DB de test autorizada.
El procedimiento productivo no se documenta aquí: consultar únicamente
[`docs/PRODUCCION.md`](PRODUCCION.md).

En Equipo, el administrador crea una persona pendiente y genera un enlace seguro. Debe compartirlo por un canal privado; el enlace vence en 24 horas y solo puede utilizarse una vez.

## Base de datos

En local/test verificar primero que `DATABASE_URL` apunta a la base dedicada de pruebas (`localhost:5434`) y nunca a un host remoto. Luego ejecutar `pnpm exec prisma db push` o aplicar la migración `prisma/migrations/20260927090000_add_hours_auth/migration.sql` en la base local. No ejecutar `prisma migrate deploy` ni DDL contra producción desde este cambio.

Para producción, el runner controlado usa `DIRECT_URL` directa de Prisma
Postgres, con prechecks, una sentencia por llamada, backup verificable y
ventana aprobada. `DATABASE_URL` sigue reservada para el runtime pooled.
También deben configurarse `AUTH_SECRET` y las variables del bootstrap solo
durante la operación inicial; no se documentan sus valores. El procedimiento
completo está únicamente en [`docs/PRODUCCION.md`](PRODUCCION.md).

La definición de migración ya declara los índices operativos de usuarios, tokens de acceso, asignaciones y auditorías de horas; el runner futuro debe verificarlos explícitamente. El límite de intentos de login requiere un mecanismo durable compatible con el despliegue y queda pendiente de una tanda de hardening: no se incorporó un limiter efímero en memoria.

## Pruebas locales

1. Levantar PostgreSQL dedicado con `docker compose -f docker-compose.test.yml up -d`.
2. Confirmar que `.env.test` usa PostgreSQL en `localhost:5434`; no imprimir la URL.
3. Aplicar el esquema con `set -a; source .env.test; set +a; DATABASE_URL="$DATABASE_URL_TEST" pnpm exec prisma db push --skip-generate`.
4. Preparar las tres identidades y proyectos con `HOURS_TEST_PASSWORD` temporal:
   `set -a; source .env.test; set +a; HOURS_TEST_PASSWORD='(secreto temporal)' pnpm seed:hours:test`.
5. Para navegador, iniciar el servidor apuntando explícitamente a `DATABASE_URL_TEST`, con `AUTH_SECRET` temporal y `PORT=3299`.
6. Ejecutar `pnpm exec vitest run tests/integration/hours.test.ts` y `pnpm test:e2e`. El E2E usa login real de Auth.js, no cookies compartidas.
7. Verificar activación, carga con horas/minutos enteros, límite de 24 horas, asignación incorrecta, fechas futuras, filtros, CSV, corrección, anulación e historial.

Para preparar las tres identidades y dos proyectos de prueba sin guardar contraseñas, usar una variable temporal:

```bash
NODE_ENV=test DATABASE_URL_TEST='<solo la URL local de .env.test>' HOURS_TEST_PASSWORD='(secreto temporal de 12+ caracteres)' pnpm seed:hours:test
```

El script rechaza cualquier host distinto de `localhost:5434` y no imprime la contraseña.

## Resultado de la validación de esta tanda

- `tests/integration/hours.test.ts`: cobertura de IDOR, idempotencia, límite
  diario, corrección administrativa con control optimista, anulación,
  auditoría y protección de proyectos con horas. El resultado exacto se valida
  en cada ejecución de la suite y no se fija como un conteo histórico aquí.
- La suite E2E pasa con administrador y dos colaboradores de test; los
  escenarios de autenticación usan login real y el resultado exacto se valida
  en cada ejecución.
- En la navegación actual, ADMIN dispone de Tiempos > Registros, Reportes y
  Administración > Usuarios con acceso a proyectos por colaborador;
  COLLABORATOR dispone únicamente de Tiempos > Registros, con
  KPIs y filtros personales dentro de la misma pantalla.
- Verificación visual Playwright: `/login`, `/hours`, `/hours/reports` y
  `/users/<id>` en escritorio y móvil, sin errores de consola observados.
  La CLI `agent-browser` no está instalada en este entorno; se usó Playwright
  directamente como fallback.
- La baseline de tests se mantiene verde; no se acepta una baseline roja para
  publicar Tiempos.

## Preparación para producción

La migración versionada continúa siendo el registro de esquema para revisión,
pero el procedimiento operativo vigente (runner, backup, inventario, variables,
bootstrap, smoke y rollback) está únicamente en
[`docs/PRODUCCION.md`](PRODUCCION.md). Este documento no debe usarse como
runbook ni contiene credenciales reales.
