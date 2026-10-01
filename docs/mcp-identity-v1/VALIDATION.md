# Validación

- `pnpm test`: 480/480 tests verdes, incluyendo MCP, identidad, seguridad, Tareas, Tiempos y runner DDL simulado.
- `pnpm exec tsc --noEmit`: correcto.
- `pnpm lint`: correcto.
- `pnpm build`: correcto.
- `git diff --check`: correcto.
- `npx playwright test tests/e2e/ --workers=1`: no validable en este entorno. Las 30 pruebas requieren `HOURS_TEST_PASSWORD` y un servidor en `localhost:3299`; no se inventaron credenciales ni se modificó el entorno.
