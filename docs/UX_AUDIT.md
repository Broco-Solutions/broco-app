# Auditoría UX de Broco App

## Quick wins aplicados

- `PageHeader` ahora muestra la descripción que ya recibía cada pantalla.
- `/users` concentra identidad, rol, estado, activación y edición básica de
  cuentas. `/hours/team` quedó limitado a asignaciones de proyectos.
- La navegación distingue `Administración` de `Asignaciones`; Tiempos muestra
  sus indicadores y filtros dentro de Registros.
- El estado vacío de Tiempos explica qué hacer cuando todavía no hay registros
  y el guardado muestra feedback accesible junto al
  formulario.

## Mejoras medias propuestas

- Agrupar visualmente Registros, Reportes y Asignaciones como subnavegación de
  Horas sin cambiar las rutas actuales.
- Agregar recuperación asistida de acceso desde Usuarios cuando exista un canal
  de entrega de enlaces.

## Mejoras estructurales propuestas

- Evaluar un shell de navegación más compacto cuando crezca el número de
  módulos.
- Evaluar una capa de permisos más granular solo si aparecen necesidades reales.

## No recomendadas ahora

- Nuevo design system, rediseño del dashboard, gráficos adicionales, nuevos
  roles o permisos configurables por pantalla.
- El Dashboard financiero no fue modificado ni incorpora reportes detallados
  de Tiempos en esta tanda.

## Observaciones técnicas y de datos

- No se detectaron P0/P1 nuevos en la auditoría read-only.
- La autenticación funcional no contiene `APP_PASSWORD` ni `broco_session`.
  Las menciones históricas restantes están marcadas como no operativas y no
  son mecanismos vigentes.
- No se modificaron entidades ni datos de la SOT. Las asignaciones siguen
  referenciando los `Project` existentes mediante FK.

## Integración UX financiera

La edición bulk de Estado solicita una fecha explícita y actualiza de forma
consistente estado, fecha relevante y fecha incompatible. Los formularios
financieros limpian correctamente campos ARS/USD al cambiar de moneda, también
en batch. Clientes, Proyectos, Ingresos y Gastos distinguen sin datos de sin
resultados por filtros o búsqueda.

Backlog UX sin implementar:

- Persistir filtros y búsquedas de Ingresos/Gastos en query params.
- Completar estados `isPending`, labels visibles y focus de todos los modales.
- Fecha de ingreso separada de `createdAt` para Usuarios/Colaboradores.
- Contratos/vencimientos asociados a Cliente y opcionalmente Proyecto.
