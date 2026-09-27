# Produccion — Broco Finance

## Arquitectura resumida

- Next.js 14 App Router + Prisma + PostgreSQL
- Server Components para lecturas, Server Actions para mutaciones
- Auth.js/NextAuth con identidades individuales, roles y sesiones JWT
- El acceso web no acepta `broco_session`, `APP_PASSWORD` ni contraseñas compartidas

## Variables requeridas

```env
DATABASE_URL=postgresql://...
AUTH_SECRET=...
PROJECT_SHARE_ENCRYPTION_KEY=...
PROJECT_SHARE_SESSION_SECRET=...
```

## Base productiva y SOT

La base PostgreSQL productiva existente es la única Source of Truth. No se
crea una base vacía, no se recrean entidades y no se valida producción contra
conteos históricos fijos. Tiempos/Auth debe incorporarse de forma aditiva
sobre esa base, preservando sus filas y relaciones.

El procedimiento futuro debe:

1. Identificar el commit de `main` y el deployment Vercel actualmente
   productivos.
2. Obtener un backup/snapshot verificable de la base existente, registrar su
   timestamp y confirmar cómo restaurarlo.
3. Capturar un inventario PRE-migración de tablas y relaciones sensibles.
4. Ejecutar prechecks y aplicar exclusivamente el DDL aditivo aprobado.
5. Capturar el inventario POST-migración y comparar antes/después.
6. Hacer deploy y ejecutar smoke tests.
7. Completar el bootstrap inicial controlado y la validación final.

Para las entidades existentes, la comparación esperada es dinámica:
`clientes_before == clientes_after`, `proyectos_before == proyectos_after`,
`ingresos_before == ingresos_after`, `gastos_before == gastos_after`,
`fases_before == fases_after` y `tareas_before == tareas_after`, salvo cambios
explícitamente aprobados. Este documento no ejecuta el backup ni escribe el
runner productivo.

## Aplicacion de migraciones

```bash
pnpm install --frozen-lockfile
npx prisma generate
```

La URL de produccion es Prisma Accelerate (`db.prisma.io`), sin `directUrl`, por lo que **no** se usa `prisma migrate deploy`. Los cambios de esquema se aplican con scripts controlados que ejecutan `$executeRawUnsafe` con **una sentencia por llamada** (ver seccion "Produccion" en AGENTS.md).

## Seeds y operaciones destructivas

No ejecutar `prisma/seed.ts`, `prisma db push`, `prisma migrate dev`, `prisma migrate deploy`, `reset` ni `truncate` contra producción. El seed canónico está restringido a `NODE_ENV=test`, `ALLOW_DESTRUCTIVE_TEST_DB=true` y la base local de test.

La Source of Truth productiva no se recrea, no se inicializa mediante seeds y no se modifica mediante comandos de desarrollo.

## Build

```bash
pnpm build
```

## Despliegue

Configurar en Vercel (o el proveedor elegido):

1. Conectar repositorio.
2. Variables de entorno: `DATABASE_URL`, `AUTH_SECRET`, `PROJECT_SHARE_ENCRYPTION_KEY`, `PROJECT_SHARE_SESSION_SECRET`.
3. Comando de build: `prisma generate && next build`.
4. Comando post-deploy: no ejecutar DDL automático. Aplicar cambios de esquema únicamente mediante un runner controlado, revisado e idempotente (`$executeRawUnsafe`, una sentencia por llamada); no usar `prisma migrate deploy` (sin `directUrl`).
5. Dominio configurado.

## Smoke test posterior

1. Acceder a la URL.
2. Iniciar sesión con una cuenta individual creada desde Equipo.
3. Verificar Dashboard con datos.
4. Navegar Clientes, Proyectos, Ingresos, Gastos.
5. Comparar el inventario POST con el PRE y confirmar que no hubo pérdida,
   duplicación ni modificación inesperada de clientes, proyectos, ingresos,
   gastos, fases o tareas.

## Respaldo previo a futuras migraciones

`psql`/`pg_dump` NO conectan a la URL de Accelerate. El respaldo debe gestionarse con las herramientas del proveedor de la base o vía Prisma; no con `pg_dump "$DATABASE_URL"`.

## Rollback

```bash
git checkout <tag-anterior>
# Restaurar datos desde backup si es necesario
```

El punto de retorno de código es el commit exacto de `main` y el deployment
Vercel anterior. El punto de retorno de datos es el backup/snapshot verificado
inmediatamente anterior al DDL; debe registrarse junto con su timestamp antes
de comenzar la operación.

El rollback de esquema no se hace con `prisma migrate deploy` (ver "Aplicacion de migraciones").
