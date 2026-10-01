# Producción — runbook vigente de Tiempos V1 + Auth

Este es el único runbook operativo vigente de Broco App. Está preparado para
una ventana controlada; **no autoriza ejecutar ninguna operación por sí solo**.
Los planes, handoffs y scripts históricos no reemplazan este documento.

## Principios no negociables

- La PostgreSQL productiva existente es la única Source of Truth (SOT).
- Tiempos/Auth se incorpora de forma aditiva: no se crea una DB, no se seedea,
  no se hace reset, `db push`, `migrate dev` ni `migrate deploy` en producción.
- No se recrean ni modifican Clientes, Proyectos, Ingresos, Gastos, tipos,
  categorías, fases, tareas, links ni relaciones históricas.
- `DATABASE_URL` es la conexión pooled de runtime de Vercel.
- `DIRECT_URL` es la conexión directa temporal de Prisma Postgres para
  inventario, migración y bootstrap; no se guarda en Git ni se usa como URL de
  runtime.
- Prisma Postgres no es el proveedor físico del backup. `psql` y `pg_dump` se
  usan, si corresponde, con la conexión directa y el proveedor aprobado.

## Inputs operativos obligatorios antes de abrir la ventana

No se deben inventar ni registrar secretos en Git. El operador debe disponer
de lo siguiente antes de continuar:

1. Identificador del proveedor PostgreSQL subyacente y acceso a su consola de
   backups/restores. Accelerate no permite deducirlo.
2. Commit de `main` y deployment Vercel que están actualmente en producción.
3. URL HTTPS canónica de producción y acceso para configurar variables.
4. Ubicación segura para guardar el backup, el inventario PRE/POST y el log de
   la ventana (fuera del repositorio).
5. Operador autorizado para crear el primer y segundo ADMIN con valores nuevos.

Si falta cualquiera de estos inputs, **no iniciar DDL ni deploy**.

## Variables de Vercel Production

Permanentes:

```text
DATABASE_URL
DIRECT_URL
AUTH_SECRET
NEXTAUTH_URL
PROJECT_SHARE_ENCRYPTION_KEY
PROJECT_SHARE_SESSION_SECRET
```

`DATABASE_URL` debe conservar la URL pooled
`postgres://...@pooled.db.prisma.io:5432/postgres?sslmode=require` para el
runtime. Antes de la ventana, obtener `DIRECT_URL` desde Prisma Console con la
conexión directa
`postgres://...@db.prisma.io:5432/postgres?sslmode=require`. No copiarla a
Git, no usarla como `DATABASE_URL` y no usar `vercel env run` como fuente de
`DIRECT_URL` para esta operación: cargarla temporalmente en el entorno seguro
del operador y verificarla con el guard.

`NEXTAUTH_URL` no es estrictamente indispensable en Vercel para este stack, pero se recomienda
configurarla explícitamente con la URL HTTPS canónica para mantener callbacks
predecibles. `AUTH_SECRET` debe generarse fuera de Git, por ejemplo con
`openssl rand -base64 32`, y no debe rotarse accidentalmente después del
primer uso porque invalida sesiones existentes. Las dos claves del portal son
hexadecimales de 64 caracteres, distintas entre sí.

Temporales, exclusivamente durante el bootstrap inicial:

```text
ALLOW_ADMIN_BOOTSTRAP=true
ADMIN_BOOTSTRAP_NAME
ADMIN_BOOTSTRAP_EMAIL
ADMIN_BOOTSTRAP_PASSWORD
```

Retirar las cuatro inmediatamente después de verificar el segundo ADMIN. No
se imprimen ni guardan sus valores en scripts, fixtures o documentación.

## Checkpoint y rollback de aplicación

Antes de tocar la DB, registrar en el log de ventana:

- timestamp de inicio;
- commit y tag propuesto del código actualmente desplegado (por ejemplo
  `pre-tiempos-v1`, sin crear/push de tag hasta tener aprobación);
- URL e identificador del deployment Vercel actual;
- commit candidato `release/tiempos-v1-prod-prep` aprobado;
- identificador del deployment nuevo, cuando exista.

La migración crea solamente enum/tablas/índices/FKs nuevos. El código anterior
no consulta esas estructuras, por lo que si el DDL termina correctamente y
falla la nueva aplicación, el rollback es volver al deployment Vercel anterior
sin restaurar la DB automáticamente.

## Backup obligatorio

Inmediatamente antes del DDL, desde la consola del **proveedor PostgreSQL
subyacente**:

1. Crear un snapshot/backup de la DB productiva existente.
2. Esperar finalización y verificar que figure utilizable.
3. Registrar proveedor, identificador, timestamp y el procedimiento/enlace de
   restauración en el log seguro de la ventana.
4. No continuar si no existe una confirmación verificable.

La restauración no es automática. Solo se considera si el inventario detecta
alteración histórica o se confirma corrupción; esa decisión detiene deploy y
requiere evaluación explícita.

## Inventario SOT PRE y POST (solo lectura)

El inventario no contiene secretos y captura dinámicamente conteos y huellas
de relaciones/agregados: Clientes, Proyectos, Ingresos, Gastos, tipos,
categorías, fases, tareas, share links, proyectos por cliente, ingresos por
cliente/proyecto/estado, gastos por proyecto/estado y totales USD agregados.

Con `DIRECT_URL` de producción ya configurada temporalmente de forma segura,
capturar:

```bash
ALLOW_PRODUCTION_INVENTORY=true pnpm prod:inventory > /ruta-segura/pre-tiempos-v1.json
```

Repetir después del DDL en otro archivo y comparar:

```bash
ALLOW_PRODUCTION_INVENTORY=true pnpm prod:inventory > /ruta-segura/post-tiempos-v1.json
pnpm prod:inventory:compare /ruta-segura/pre-tiempos-v1.json /ruta-segura/post-tiempos-v1.json
```

El resultado debe ser `INVENTORY_MATCH`. Cualquier diferencia histórica es
`INVENTORY_MISMATCH`: **abortar**, no hacer deploy y preservar evidencia. Las
nuevas tablas Auth/Tiempos no forman parte de esta comparación porque son la
adición esperada.

## Runner controlado Auth/Tiempos

El runner es `scripts/migrate-hours-auth-production.ts`. Usa un `PrismaClient`
explícito y `$executeRawUnsafe` con **una sola sentencia por llamada**,
compatible con Prisma Postgres directo. Requiere simultáneamente:

- `ALLOW_PRODUCTION_MIGRATION=true`;
- `DIRECT_URL` `postgres://` o `postgresql://` a `db.prisma.io:5432/postgres`
  con `sslmode=require`;
- tablas históricas esperadas;
- estado de esquema reconocido.

## Runner controlado Tareas Operativas

El runner `scripts/migrate-operational-tasks-production.ts` sigue las mismas
protecciones de destino que Auth/Tiempos: exige `ALLOW_PRODUCTION_MIGRATION=true`
y `DIRECT_URL` directa validada. Su DDL versionado está en
`prisma/migrations/20261001090000_add_operational_tasks/migration.sql`.

Antes de ejecutarlo se requiere backup e inventario PRE. El runner reconoce
únicamente estado no aplicado, completo o parcial; un estado parcial aborta sin
intentar reparaciones. Después de una aplicación exitosa, una segunda ejecución
debe responder `PRECHECK_COMPLETE` y `MIGRATION_SKIPPED`.

```bash
ALLOW_PRODUCTION_MIGRATION=true pnpm prod:migrate:operational-tasks
```

Este comando no se ejecuta automáticamente durante build o deploy.

Nunca imprime URL, secretos ni DDL sensible. Sus estados son:

| Estado | Acción |
| --- | --- |
| `PRECHECK_NOT_APPLIED` | Puede ejecutar el DDL aditivo. |
| `PRECHECK_COMPLETE` + `MIGRATION_SKIPPED` | Todo existe y coincide; segunda ejecución segura. |
| `PRECHECK_PARTIAL_ABORT` | Hay estructuras nuevas incompletas o con forma inesperada; detener. |
| `PRECHECK_HISTORICAL_SCHEMA_MISSING_ABORT` | Falta base histórica esperada; detener. |

El DDL crea `AppUserRole`, `app_users`, `access_tokens`, `hour_assignments`,
`time_entries` y `time_entry_audits`; verifica sus columnas/nullability,
índices/unique, FKs y `onDelete`. Incluye los índices de usuarios por rol y
estado, tokens, asignaciones por proyecto y auditorías por entrada/fecha.
No altera ninguna tabla histórica; las FKs nuevas referencian `projects`.

Ejecutar una sola vez, tras backup e inventario PRE:

```bash
ALLOW_PRODUCTION_MIGRATION=true pnpm prod:migrate:hours-auth
```

Si cualquier sentencia falla, el runner se detiene. No continuar, no hacer
`DROP` ni relanzar a ciegas: conservar el output, ejecutar el inventario
read-only y evaluar el estado parcial con el backup disponible. Si termina,
ejecutar exactamente el mismo comando una segunda vez: debe informar
`PRECHECK_COMPLETE` y `MIGRATION_SKIPPED`.

## Secuencia exacta de la ventana

- [ ] Confirmar code freeze, rama/commit candidato y working tree limpio.
- [ ] Registrar commit/tag propuesto y deployment Vercel anterior.
- [ ] Confirmar inputs operativos y variables permanentes sin revelar valores.
- [ ] Crear y verificar backup/snapshot de la SOT existente.
- [ ] Guardar inventario PRE en ubicación segura.
- [ ] Ejecutar runner; confirmar `PRECHECK_NOT_APPLIED`, `POSTCHECK_COMPLETE`
      y `MIGRATION_COMPLETED`.
- [ ] Ejecutar runner nuevamente; confirmar `PRECHECK_COMPLETE` y
      `MIGRATION_SKIPPED`.
- [ ] Guardar inventario POST y confirmar `INVENTORY_MATCH`.
- [ ] Crear/deployar el deployment del commit candidato (sin DDL automático).
- [ ] Ejecutar smoke de lectura y portal/MCP.
- [ ] Configurar temporalmente variables de bootstrap y crear primer ADMIN.
- [ ] Crear segundo ADMIN desde la UI, verificar ambos accesos y retirar las
      variables temporales.
- [ ] Ejecutar smoke final, registrar resultados y cerrar la ventana.

## Bootstrap del primer ADMIN

Solo después de `MIGRATION_COMPLETED`, inventario coincidente y deploy nuevo
disponible, configurar temporalmente las variables de bootstrap y ejecutar el
script desde un entorno autorizado con `DIRECT_URL` productiva:

```bash
pnpm bootstrap:admin
```

El script exige `ALLOW_ADMIN_BOOTSTRAP=true`, usa cliente explícito contra el
endpoint aprobado, toma lock advisory y solo crea un ADMIN activo si no existe
ningún ADMIN. No sobrescribe correos existentes ni registra la contraseña.

1. Verificar login del primer ADMIN.
2. Ir a Administración > Usuarios y crear un segundo ADMIN desde la UI.
3. Completar activación y verificar login de ambos.
4. Retirar inmediatamente las cuatro variables temporales.
5. Confirmar que un nuevo intento de bootstrap aborta.

## Smoke posterior al deploy

Antes de crear colaboradores reales, validar principalmente lecturas:

- ADMIN: login; Dashboard; Clientes y detalle; Proyectos y detalle; Ingresos;
  Gastos; Tiempos/Registros; Reportes; Asignaciones; Usuarios.
- Finanzas: comprobar lecturas y filtros; no crear ni editar datos reales como
  smoke inicial.
- Portal: abrir un proyecto existente, confirmar acceso read-only y ausencia de
  datos financieros internos.
- MCP: solo consultas autorizadas (`consultar_clientes`, proyectos e ingresos
  o gastos); confirmar OAuth/scopes sin escrituras.
- Auth: primer y segundo ADMIN ingresan; bootstrap ya no funciona.
- Tiempos: solo con usuario/proyecto de prueba aprobado: asignar, cargar y
  anular mediante la aplicación. Registrar el ID y limpiar únicamente mediante
  la misma app, nunca SQL manual.

## Rollback y escalamiento

**Fallo de aplicación con DDL correcto:** volver al deployment Vercel anterior.
No restaurar DB automáticamente; las nuevas tablas quedan aditivas y sin uso
por el código anterior.

**Fallo de DDL / estado parcial:** detener. No continuar ni aplicar un rollback
DDL improvisado. Guardar salida, inventario y estado para evaluación manual.

**Cambio histórico o corrupción confirmada:** detener deploy y cualquier
bootstrap. Comparar PRE/POST, escalar al responsable operativo y decidir
explícitamente la restauración desde el snapshot verificado. Nunca restaurar
automáticamente.

## Límites posteriores a V1

El rate limiting durable de login sigue siendo hardening P2 y no se resuelve
con memoria local. No se incorporan durante esta ventana nuevas features,
roles, filtros, MCP de Tiempos, Contratos ni Fecha de ingreso.
