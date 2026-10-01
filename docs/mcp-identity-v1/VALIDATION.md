# Validación

- `pnpm test`: 480/480 tests verdes, incluyendo MCP, identidad, seguridad, Tareas, Tiempos y runner DDL simulado.
- `npx playwright test tests/e2e/ --workers=1`: 30/30 verde. Se usó PostgreSQL local en `localhost:5434`, el fixture oficial `pnpm seed:hours:test`, `APP_PASSWORD` de `.env.test` como `HOURS_TEST_PASSWORD` temporal y `SESSION_SECRET` como `AUTH_SECRET` sólo para el proceso local; ningún secreto fue impreso ni creado.
- `pnpm exec tsc --noEmit`: correcto.
- `pnpm lint`: correcto.
- `pnpm build`: correcto.
- `git diff --check`: correcto.
