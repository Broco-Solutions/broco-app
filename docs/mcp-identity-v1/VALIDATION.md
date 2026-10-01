# Validación

- `pnpm test`: 480/480 tests verdes, incluyendo MCP, identidad, seguridad, Tareas, Tiempos y runner DDL simulado.
- `npx playwright test tests/e2e/ --workers=1`: 30/30 verde. Se usó PostgreSQL local en `localhost:5434`, el fixture oficial `pnpm seed:hours:test`, `APP_PASSWORD` de `.env.test` como `HOURS_TEST_PASSWORD` temporal y `SESSION_SECRET` como `AUTH_SECRET` sólo para el proceso local; ningún secreto fue impreso ni creado.
- `pnpm exec tsc --noEmit`: correcto.
- `pnpm lint`: correcto.
- `pnpm build`: correcto.
- `git diff --check`: correcto.

## Publicación productiva

- Backup PRE: `/home/rcoirini/backups/broco/broco-pre-mcp-identities-20261001-224734.dump`, 102.831 bytes, SHA-256 `f13c517f044a0d1d365dfe1b4fd99613cbccd207452bfc032d1a90e69023a174`; `pg_restore --list` confirmó que el dump custom es legible.
- Inventario PRE: `/home/rcoirini/backups/broco/broco-pre-mcp-identities-20261001-224734.inventory.json`, SHA-256 `5e5be61bcc7b03c5d8d996521978b8efd9b58aab2b773750187d67e7470996e7`.
- `prod:migrate:mcp-identities`: primera ejecución `PRECHECK_NOT_APPLIED`, `POSTCHECK_COMPLETE`, `MIGRATION_COMPLETED`; segunda ejecución `PRECHECK_COMPLETE`, `MIGRATION_SKIPPED`. No se ejecutaron runners de Tareas Operativas ni de TimeEntry.
- Inventario POST: `/home/rcoirini/backups/broco/broco-post-mcp-identities-20261001-224734.inventory.json`, SHA-256 `0d2578099134386fd1d0db812d84ff5728c64539bdbf7f65a3f7f77618e7ceba`. `prod:inventory:compare` confirmó `INVENTORY_MATCH`, preservando la SOT histórica.
- `main` se integró por fast-forward de `7e3a8c8` a `261d4cc` y se publicó en `origin/main`. En `main`: `pnpm test` 480/480, typecheck, lint, build y `git diff --check` correctos.
- Vercel publicó `dpl_Enm9Q3Zk3YD651eh5Nr8SYbYypMf` para `261d4cc`, estado `READY`, con alias `https://app.brocosolutions.com`.
- Smoke no autenticado: login disponible, `/tasks` redirige a login y `/api/mcp` responde `401`. No había credenciales productivas legítimas disponibles para smoke autenticado ADMIN/COLLABORATOR ni OAuth MCP; no se crearon usuarios ni datos de prueba.

## Fix diagnóstico auto-link AppUser

- Producción exponía MCP y autenticaba OAuth, pero las llamadas con usuario fallaban con `APP_USER_REQUIRED`.
- Vercel Production no tenía configuradas `BROCO_MCP_AUTH0_EMAIL_CLAIM` ni `BROCO_MCP_AUTH0_EMAIL_VERIFIED_CLAIM`; con los defaults (`email`, `email_verified`) el resolver no recibía email verificado para crear el primer `McpIdentity`.
- Se agregó diagnóstico sanitizado de claims/auto-link y cobertura del primer vínculo exitoso, email no verificado/ausente, AppUser inactivo, cambio de email posterior y vínculo existente como autoridad primaria.
- Validación local del fix: tests enfocados 30/30, `pnpm test` 482/482, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build` y `git diff --check` correctos.
