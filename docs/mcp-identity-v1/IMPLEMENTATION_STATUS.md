# Estado

- Lote 1: identidad persistente, resolución por request y DDL controlado.
- Lote 2: todas las tools financieras, administrativas y de planificación restringidas a ADMIN.
- Lote 3: tools de OperationalTask reutilizando sus servicios de dominio.
- Lote 4: tools de TimeEntry reutilizando permisos, auditoría, CAS y anulación lógica.
- Lote 5: cobertura de bypass de IDs, rol, desactivación, finanzas, planificación y asignaciones completada.
- Lote 6: unit/integración, lint, typecheck, build y diff-check completados; E2E no ejecutable en este entorno sin `HOURS_TEST_PASSWORD` y servidor en el puerto 3299.
