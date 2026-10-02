# Matriz de permisos MCP

| Tool | Sin AppUser activo | COLLABORATOR | ADMIN |
|---|---|---|---|
| resumen_financiero | Denegado | Denegado | Permitido |
| consultar_clientes | Denegado | Denegado | Permitido |
| consultar_proyectos | Denegado | Denegado | Permitido |
| flujo_fondos | Denegado | Denegado | Permitido |
| detalle_proyecto | Denegado | Denegado | Permitido |
| consultar_ingresos | Denegado | Denegado | Permitido |
| consultar_gastos | Denegado | Denegado | Permitido |
| planificacion_proyecto | Denegado | Denegado | Permitido |
| resumen_proyectos | Denegado | Denegado | Permitido |
| consultar_tipos_ingreso | Denegado | Denegado | Permitido |
| consultar_categorias_gasto | Denegado | Denegado | Permitido |
| crear_ingreso, actualizar_ingreso, marcar_ingreso_cobrado, eliminar_ingreso | Denegado | Denegado | `mcp:write` + ADMIN |
| crear_gasto, actualizar_gasto, marcar_gasto_pagado, eliminar_gasto | Denegado | Denegado | `mcp:write` + ADMIN |
| crear_tipo_ingreso, actualizar_tipo_ingreso, eliminar_tipo_ingreso | Denegado | Denegado | `mcp:write` + ADMIN |
| crear_categoria_gasto, actualizar_categoria_gasto, eliminar_categoria_gasto | Denegado | Denegado | `mcp:write` + ADMIN |
| crear_fase_proyecto, actualizar_fase_proyecto, reordenar_fases_proyecto, eliminar_fase_proyecto | Denegado | Denegado | `mcp:write` + ADMIN |
| crear_tarea_proyecto, actualizar_tarea_proyecto, cambiar_estado_tarea, mover_tarea_de_fase, reordenar_tareas_proyecto, eliminar_tarea_proyecto | Denegado | Denegado | `mcp:write` + ADMIN |
| consultar_proyectos_operativos | Denegado | Sólo proyectos con acceso de proyecto, DTO mínimo | Proyectos activos, DTO mínimo |
| consultar_usuarios | Denegado | Denegado | Usuarios operativos mínimos, con filtros de nombre/email, activo y rol |
| consultar_tareas_operativas | Denegado | Sólo propias | Todas |
| crear_tarea_operativa, actualizar_tarea_operativa, cambiar_estado_tarea_operativa | Denegado | `mcp:write`; sólo propia, asignación forzada | `mcp:write`; todas, puede reasignar |
| consultar_tiempos | Denegado | Sólo propios | Todos según filtros |
| registrar_tiempo, actualizar_tiempo, anular_tiempo | Denegado | `mcp:write`; sólo propios y proyectos asignados | `mcp:write`; reglas humanas y auditoría |

La lista de tools puede ser visible tras OAuth, pero cada ejecución aplica esta matriz server-side; ocultar nombres nunca es un control de seguridad.
