# Horas v1

## Alcance

El módulo independiente `/hours` permite registrar minutos normalizados por persona, cliente y proyecto, consultar registros, reportar horas registradas y exportar el detalle filtrado a CSV. `/hours/team` es exclusivo de administradores y administra usuarios, activación y asignaciones usuario → proyecto. Las anulaciones son lógicas y dejan auditoría.

Los colaboradores solo ven Horas y Reportes de horas, registran para sí mismos y únicamente en proyectos activos asignados. Los administradores conservan la aplicación financiera y pueden registrar para otra persona. El portal `/p` y el MCP mantienen autenticación y permisos independientes.

## Decisiones

- Auth.js/NextAuth con Credentials y sesión JWT de 12 horas. La cuenta activa se vuelve a consultar en servidor; desactivar incrementa la versión de sesión y bloquea el acceso en el siguiente request. No se acepta `broco_session` ni clave compartida.
- `bcryptjs` hashea contraseñas; los enlaces de activación son tokens aleatorios, almacenados solo como SHA-256, de un uso y con vencimiento de 24 horas. El token en claro no se persiste ni se registra.
- La suma diaria se valida dentro de una transacción Serializable con lock advisory por persona/fecha. El máximo es 1440 minutos.
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

## Pruebas locales

1. `pnpm test:db:up`.
2. Confirmar que `.env.test` usa PostgreSQL en `localhost:5434`; no imprimir la URL.
3. `DATABASE_URL=<base dedicada> pnpm exec prisma db push` y crear tres cuentas locales: un admin y dos colaboradores. Asignar proyectos distintos desde Equipo.
4. Iniciar con `AUTH_SECRET` definido: `pnpm dev`.
5. Verificar activación, carga con minutos/horas y coma/punto, cambio de unidad, límite de 24 horas, asignación incorrecta, fechas futuras, filtros, CSV, anulación e historial.
6. Ejecutar `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` y el build. Los tests E2E históricos que inyectan `broco_session=ok` deben migrarse a login real de Auth.js antes de considerarse válidos.

## Pendientes antes de producción

- Revisar y migrar todos los E2E existentes a cuentas de prueba Auth.js y agregar cobertura específica de seguridad, reintentos, paginación, auditoría y flujo completo en navegador.
- Añadir pantalla de edición administrativa con motivo obligatorio (la v1 ya soporta anulación con motivo y auditoría).
- Ejecutar un runner de esquema con pre-checks contra producción, configurar `AUTH_SECRET`, verificar cookies seguras, backup y rollback, y completar una prueba con tres cuentas no reales.
- No hacer deploy, push ni crear credenciales reales como parte de esta entrega.
