# Tareas Operativas V1 — alcance

## Dominio

- `ProjectTask` conserva exclusivamente la planificación, el Gantt, las fases, los hitos, el cronograma y el avance del proyecto.
- `OperationalTask` representa trabajo cotidiano asignado a una persona.
- Los estados persistidos son `PENDING`, `IN_PROGRESS`, `BLOCKED` y `DONE`.
- “Vencida” se calcula cuando `dueDate < hoy` y el estado no es `DONE`.
- El proyecto es opcional. El cliente se deriva siempre de `OperationalTask.project.client`.
- No existe vínculo con `ProjectTask` en V1. Una FK opcional podrá agregarse más adelante sin sincronizar estados.

## Reglas funcionales

- Un colaborador sólo ve y modifica tareas donde es responsable.
- Un colaborador sólo crea tareas para sí mismo y sólo usa proyectos activos presentes en sus `HourAssignment`.
- Un administrador ve todas las tareas, crea para cualquier usuario activo y puede reasignar.
- Bloquear exige un motivo. Al salir de `BLOCKED`, el motivo se conserva como contexto.
- Al entrar en `DONE`, se establece `completedAt`; al reabrir, se limpia.
- Completar una tarea no obliga a registrar tiempo.
- Registrar tiempo requiere que la tarea tenga proyecto y crea un `TimeEntry` real.
- La carga rápida pide fecha, horas, minutos y detalle opcional; deriva usuario, proyecto y descripción desde la tarea y persiste únicamente minutos totales.
- Los tiempos anulados no integran el total mostrado en la tarea.

## Fuera de alcance

Comentarios, chat, menciones, adjuntos, prioridad, etiquetas, subtareas, dependencias, recurrencia, watchers, Kanban, Gantt operativo, estimaciones, porcentaje de avance, posiciones manuales, cliente independiente, vínculo con `ProjectTask` y notificaciones.
