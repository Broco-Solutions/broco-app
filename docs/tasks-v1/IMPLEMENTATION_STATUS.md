# Tareas Operativas V1 — estado de implementación

| Lote | Estado | Alcance |
| --- | --- | --- |
| 1. Dominio y seguridad | Completo | Modelo, DDL, servicios, acciones, permisos, CAS y tests |
| 2. Tabla y experiencia | Completo | Navegación, `/tasks`, tabla, filtros coordinados, orden, creación, edición y detalle |
| 3. Bloqueos y pulido | Completo | Motivo obligatorio, contexto histórico, descripción amplia, CAS, reapertura y errores |
| 4. Integración con Tiempos | Completo | FK nullable, carga rápida real, auditoría, totales activos, registros y administración existente |
| 5. MCP | Bloqueado | No se publican tools hasta resolver el mapeo OAuth ↔ AppUser/rol; la UI y servicios no dependen de esta decisión |
| 6. Validación integral | Completo | Revisión visual autenticada, unit/integración, build, E2E dedicado y suite global 30/30 |
