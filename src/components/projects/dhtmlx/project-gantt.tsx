"use client";

import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2, CalendarDays, RotateCcw } from "lucide-react";
import { toDhtmlxData } from "./project-gantt-adapter";
import type { PhaseDTO, TaskDTO } from "./project-gantt-types";
import { changeTaskDatesAction, reorderTasksAction } from "@/app/projects/planning-actions";
import "dhtmlx-gantt/codebase/dhtmlxgantt.css";
import "./project-gantt.css";

type Props = {
  phases: PhaseDTO[];
  tasks: TaskDTO[];
  portal?: boolean;
  projectId?: string;
};

type TypeFilter = "all" | "task" | "milestone";

const STATUS_LABEL: Record<string, string> = {
  TODO: "Por hacer",
  IN_PROGRESS: "En progreso",
  TO_REVIEW: "A revisar",
  BLOCKED: "Bloqueado",
  DONE: "Hecho",
};

const ZOOM_LEVELS = [
  {
    name: "day",
    label: "Día",
    scale_height: 27,
    min_column_width: 60,
    scales: [{ unit: "day", step: 1, format: "%d %M" }],
  },
  {
    name: "week",
    label: "Semana",
    scale_height: 27,
    min_column_width: 80,
    scales: [
      { unit: "month", step: 1, format: "%F %Y" },
      {
        unit: "week",
        step: 1,
        format: (d: Date) => {
          const end = new Date(d);
          end.setDate(end.getDate() + 6);
          const sameMonth = d.getMonth() === end.getMonth();
          const m1 = d.toLocaleDateString("es-AR", { month: "short" }).replace(".", "");
          const m2 = end.toLocaleDateString("es-AR", { month: "short" }).replace(".", "");
          if (sameMonth) return `${d.getDate()}–${end.getDate()} ${m1}`;
          return `${d.getDate()} ${m1}–${end.getDate()} ${m2}`;
        },
      },
    ],
  },
  {
    name: "month",
    label: "Mes",
    scale_height: 27,
    min_column_width: 100,
    scales: [
      { unit: "year", step: 1, format: "%Y" },
      { unit: "month", step: 1, format: "%M" },
    ],
  },
] as const;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtEs(d: Date): string {
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function computeHeight(phases: number, tasks: number): number {
  const rows = phases + tasks;
  const h = 50 + rows * 40 + 20; // header 50 + rows*row_height + margen
  return Math.min(560, Math.max(280, h));
}

export function ProjectGantt({ phases, tasks, portal = false, projectId }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [zoomName, setZoomName] = useState<string | number>("month");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const savingRef = useRef<Set<string>>(new Set());

  const dataKey = JSON.stringify({ phases, tasks });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    let gantt: any = null;
    let markerId: string | number | null = null;
    const detachIds: (string | number)[] = [];
    const isMobile = window.matchMedia("(max-width: 640px)").matches;

    const attach = (name: string, fn: (...args: any[]) => any) => {
      detachIds.push(gantt.attachEvent(name, fn));
    };

    (async () => {
      const mod = await import("dhtmlx-gantt");
      gantt = (mod as any).gantt || (mod as any).default?.gantt || (mod as any).default;
      if (cancelled || !el || !gantt) return;

      try {
        gantt.i18n.setLocale("es");
      } catch {}
      gantt.config.start_on_monday = true;
      gantt.config.date_format = "%Y-%m-%d";
      // Geometría vía API (no CSS): row_height/bar_height gobiernan filas y barras
      gantt.config.row_height = 40;
      gantt.config.bar_height = 22;
      gantt.config.scale_height = 54;
      // grid_width debe coincidir con suma de columns (evita clipping/empty timeline)
      gantt.config.grid_width = isMobile ? 150 : portal ? 320 : 540;
      gantt.config.sort = !portal;
      gantt.config.order_branch = !portal && !isMobile; // disabled when sorted
      gantt.config.order_branch_free = false;
      gantt.config.details_on_dblclick = false;
      gantt.config.details_on_create = false;
      gantt.config.drag_links = false;
      gantt.config.drag_progress = false;
      gantt.config.drag_resize = !portal && !isMobile;
      gantt.config.drag_move = !portal && !isMobile;
      gantt.config.show_markers = true;
      gantt.config.show_grid = true;
      gantt.config.show_task_grid = true;
      gantt.config.readonly = portal;
      gantt.config.smart_rendering = false;

      // Columns — anchos validados contra grid_width
      const columns: any[] = [
        {
          name: "text",
          label: "Tarea",
          tree: true,
          width: isMobile ? 150 : portal ? 210 : 250,
          resize: false,
        },
      ];
      if (!isMobile) {
        if (!portal) {
          columns.push(
            {
              name: "status",
              label: "Estado",
              width: 110,
              align: "left",
              template: (t: any) =>
                t.type === "milestone"
                  ? `<span class="gantt-status-dot gantt-dot-${String(t.status ?? "todo").toLowerCase()}"></span>◆ ${escapeHtml(STATUS_LABEL[t.status] ?? t.status ?? "")}`
                  : `<span class="gantt-status-dot gantt-dot-${String(t.status ?? "todo").toLowerCase()}"></span>${escapeHtml(STATUS_LABEL[t.status] ?? t.status ?? "")}`,
            },
            {
              name: "start_date",
              label: "Inicio",
              width: 90,
              align: "center",
              template: (t: any) => (t.start_date ? fmtEs(t.start_date) : ""),
            },
            {
              name: "end_date",
              label: "Fin",
              width: 90,
              align: "center",
              template: (t: any) => (t.end_date ? fmtEs(t.end_date) : ""),
            },
          );
        } else {
          columns.push({
            name: "status",
            label: "Estado",
            width: 110,
            align: "left",
            template: (t: any) =>
              `<span class="gantt-status-dot gantt-dot-${String(t.status ?? "todo").toLowerCase()}"></span>${escapeHtml(STATUS_LABEL[t.status] ?? t.status ?? "")}`,
          });
        }
      }
      gantt.config.columns = columns;

      // Grid text ellipsis for long names (DHTMLX truncates; tooltip shows full)
      gantt.templates.grid_blank = () => "";

      // Row / bar styling
      gantt.templates.timeline_cell_class = (_task: unknown, date: Date) => {
        const d = date.getDay();
        return d === 0 || d === 6 ? "weekend" : "";
      };
      gantt.templates.task_class = (_s: string, _e: Date, task: any) => {
        if (task.type === "milestone") return `gantt-milestone gantt-milestone-${String(task.status ?? "todo").toLowerCase()}`;
        return `gantt-task-line gantt-task-${String(task.status ?? "todo").toLowerCase()}`;
      };
      gantt.templates.project_class = () => "gantt-phase-bar";

      // Tooltip (escaped)
      try {
        gantt.plugins({ tooltip: true });
      } catch {}
      gantt.templates.tooltip_text = (_s: Date, _e: Date, task: any) => {
        const name = escapeHtml(String(task.text ?? ""));
        const status = task.status ? STATUS_LABEL[task.status] : null;
        const isMilestone = task.type === "milestone";
        const start = task.start_date ? fmtEs(new Date(task.start_date)) : "";
        const end = task.end_date ? fmtEs(new Date(task.end_date)) : "";
        if (task.type === "project") {
          return `<div class="gantt-tooltip"><strong>${name}</strong><div>${start} → ${end}</div></div>`;
        }
        const statusHtml = status ? `<div><span class="gantt-status-dot gantt-dot-${String(task.status).toLowerCase()}"></span>${escapeHtml(status)}</div>` : "";
        const desc = task.description ? `<div class="gantt-tooltip-desc">${escapeHtml(String(task.description))}</div>` : "";
        if (isMilestone) {
          return `<div class="gantt-tooltip"><strong>${name}</strong>${statusHtml}<div>${start}</div>${desc}</div>`;
        }
        return `<div class="gantt-tooltip"><strong>${name}</strong>${statusHtml}<div>${start} → ${end}</div>${desc}</div>`;
      };

      // Today marker (cobalt)
      try {
        markerId = gantt.addMarker({
          start_date: new Date(),
          css: "today",
          text: "Hoy",
          title: "Hoy",
        });
      } catch {}

      // Zoom levels — DHTMLX getCurrentLevel() retorna índice numérico (0:Día,1:Semana,2:Mes)
      try {
        if (gantt.ext && gantt.ext.zoom) {
          const zoom = gantt.ext.zoom;
          zoom.init({ levels: ZOOM_LEVELS as any });
          zoom.setLevel("month");
          try {
            const cur = zoom.getCurrentLevel();
            if (typeof cur === "number") setZoomName(cur);
          } catch {}
          try {
            zoom.attachEvent("onAfterZoom", (level: any) => {
              if (typeof level === "number") setZoomName(level);
              else if (level && typeof level.name === "string") setZoomName(level.name);
              else {
                try {
                  const cur2 = zoom.getCurrentLevel();
                  setZoomName(cur2);
                } catch {}
              }
            });
          } catch {}
        }
      } catch {}

      // ---- Persistence guards ----
      if (!portal) {
        // Block dragging/resizing phases and milestone resize
        attach("onBeforeTaskDrag", (id: string | number, mode: string, task: any) => {
          if (savingRef.current.has(String(id))) return false;
          if (task.type === "project") return false;
          if (task.type === "milestone" && mode === "resize") return false;
          return true;
        });

        // Persist move/resize after drop — DHTMLX onAfterTaskDrag(id, mode, e): usar gantt.getTask(id)
        attach("onAfterTaskDrag", (id: string | number) => {
          const task = gantt.getTask(id);
          if (task && (task.type === "milestone" || task.type === "task")) {
            void persistDates(String(id), task);
          }
        });

        // Block cross-phase reorder
        attach("onBeforeTaskMove", (id: string | number, parent: string | number) => {
          if (savingRef.current.has(String(id))) return false;
          const task = gantt.getTask(id);
          if (!task || task.type === "project") return false;
          const origParent = task.parent;
          return origParent === parent;
        });

        // Persist reorder after drop
        attach("onAfterTaskMove", (id: string | number) => {
          const task = gantt.getTask(id);
          if (!task) return;
          void persistReorder(task.parent == null ? null : String(task.parent));
        });
      }

      // ---- Sort disables reorder ----
      attach("onAfterSort", () => {
        if (gantt) gantt.config.order_branch = false;
      });

      // ---- Persistence helpers ----
      const persistDates = async (taskId: string, task: any) => {
        if (savingRef.current.has(taskId)) return;
        savingRef.current.add(taskId);
        setSaveState("saving");
        const originalStart = new Date(task.start_date);
        const originalEnd = new Date(task.end_date);
        const fd = new FormData();
        fd.set("taskId", taskId);
        fd.set("startDate", toDateStr(originalStart));
        fd.set("endDate", toDateStr(task.type === "milestone" ? originalStart : originalEnd));
        const res = await changeTaskDatesAction(null, fd);
        savingRef.current.delete(taskId);
        if (res.success) {
          setSaveState("saved");
          setTimeout(() => setSaveState("idle"), 1600);
        } else {
          setSaveState("error");
          setTimeout(() => setSaveState("idle"), 3000);
          // restore visually
          try {
            gantt.updateTask(taskId, {
              start_date: originalStart,
              end_date: originalEnd,
            });
            gantt.refreshData();
          } catch {}
        }
      };

      // projectId explícito evita regresión (task no trae projectId en DHTMLX)
      const persistReorder = async (phaseId: string | null) => {
        if (!projectId) return;
        setSaveState("saving");
        const children = gantt.getChildren(phaseId ?? 0) as (string | number)[];
        const orderedTaskIds = children.map(String);
        const fd = new FormData();
        fd.set("projectId", projectId);
        if (phaseId) fd.set("phaseId", phaseId);
        fd.set("orderedTaskIds", orderedTaskIds.join(","));
        const res = await reorderTasksAction(null, fd);
        if (res.success) {
          setSaveState("saved");
          setTimeout(() => setSaveState("idle"), 1600);
        } else {
          setSaveState("error");
          setTimeout(() => setSaveState("idle"), 3000);
        }
      };

      // Expose for toolbar
      (el as any)._gantt = gantt;
      (el as any)._onAfterTaskDrag = (taskId: string) => {
        const t = gantt.getTask(taskId);
        if (t) void persistDates(taskId, t);
      };

      gantt.init(el);

      const ganttData = toDhtmlxData(phases, tasks, {
        type: typeFilter,
        status: statusFilter,
      });
      gantt.clearAll();
      gantt.parse({ data: ganttData });

      // Initial view: zoomToFit on desktop, Week+clamp on mobile
      setTimeout(() => {
        if (cancelled || !gantt) return;
        try {
          if (isMobile) {
            gantt.ext.zoom.setLevel("week");
            const range = computeRange(ganttData);
            const focus = clampDate(new Date(), range.min, range.max);
            gantt.showDate(focus);
          } else {
            gantt.ext.zoom.zoomToFit?.();
          }
        } catch {}
      }, 60);
    })();

    return () => {
      cancelled = true;
      try {
        if (gantt) {
          for (const id of detachIds) gantt.detachEvent(id);
          if (markerId) {
            try {
              gantt.deleteMarker(markerId);
            } catch {}
          }
          gantt.clearAll();
          if (gantt.destructor) gantt.destructor();
        }
      } catch {}
      if (el) el.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, portal]);

// Re-parse on data or filter change
  useEffect(() => {
    (async () => {
      const mod = await import("dhtmlx-gantt");
      const gantt = (mod as any).gantt || (mod as any).default?.gantt;
      if (!gantt || !ref.current) return;
      const ganttData = toDhtmlxData(phases, tasks, {
        type: typeFilter,
        status: statusFilter,
      });
      gantt.clearAll();
      gantt.parse({ data: ganttData });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, typeFilter, statusFilter]);

  // Keep reorder enabled only when no sort is active (DHTMLX sets order_branch=false on sort)

  const exec = (fn: (g: any) => void) => {
    (async () => {
      const mod = await import("dhtmlx-gantt");
      const gantt = (mod as any).gantt || (mod as any).default?.gantt;
      if (gantt) fn(gantt);
    })();
  };

  const hasAnyFilter = typeFilter !== "all" || statusFilter !== "all";
  const zoomLabel = (() => {
    const n = typeof zoomName === "number" ? zoomName : parseInt(String(zoomName), 10);
    if (!isNaN(n) && ZOOM_LEVELS[n]) return ZOOM_LEVELS[n].label;
    const byName = ZOOM_LEVELS.find((z) => z.name === String(zoomName));
    return byName?.label ?? "Mes";
  })();

  return (
    <div className="dhtmlx-gantt-host space-y-3">
      {/* Toolbar — [ − ] [ Mes ] [ + ] [ Ajustar ] [ Hoy ] */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
          <button
            aria-label="Alejar"
            onClick={() => exec((g) => g.ext.zoom.zoomOut())}
            className="gantt-toolbar-btn"
            title="Alejar"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="gantt-zoom-label" aria-live="polite">
            {zoomLabel}
          </span>
          <button
            aria-label="Acercar"
            onClick={() => exec((g) => g.ext.zoom.zoomIn())}
            className="gantt-toolbar-btn"
            title="Acercar"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            aria-label="Ajustar"
            onClick={() => exec((g) => g.ext.zoom.zoomToFit?.())}
            className="gantt-toolbar-btn gantt-toolbar-btn--text"
            title="Ajustar vista completa"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Ajustar
          </button>
          <button
            aria-label="Hoy"
            onClick={() => exec((g) => g.showDate?.(new Date()))}
            className="gantt-toolbar-btn gantt-toolbar-btn--text"
            title="Ir a hoy"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Hoy
          </button>
        </div>

        {!portal && (
          <>
            <div className="flex items-center gap-1.5">
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value as TypeFilter);
                }}
                className="gantt-select"
                aria-label="Tipo"
              >
                <option value="all">Todos</option>
                <option value="task">Tareas</option>
                <option value="milestone">Hitos</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                }}
                className="gantt-select"
                aria-label="Estado"
              >
                <option value="all">Todos</option>
                <option value="TODO">Por hacer</option>
                <option value="IN_PROGRESS">En progreso</option>
                <option value="TO_REVIEW">A revisar</option>
                <option value="BLOCKED">Bloqueado</option>
                <option value="DONE">Hecho</option>
              </select>
            </div>

            {hasAnyFilter && (
              <button
                onClick={() => {
                  setTypeFilter("all");
                  setStatusFilter("all");
                }}
                className="gantt-toolbar-btn gantt-reset-btn"
                title="Restablecer"
                aria-label="Restablecer filtros"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
          </>
        )}

        {saveState !== "idle" && (
          <span className={`gantt-save-state gantt-save-${saveState}`}>
            {saveState === "saving" ? "Guardando…" : saveState === "saved" ? "Guardado" : "No se pudo guardar. Se restauró la planificación."}
          </span>
        )}
      </div>

      {/* Empty state */}
      {tasks.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-ink/60">
          {portal ? "El cronograma todavía no tiene actividades publicadas." : "No hay tareas para mostrar en el cronograma."}
        </div>
      ) : (
        <div
          ref={ref}
          className="dhtmlx-gantt w-full overflow-hidden rounded-lg border border-gray-200 bg-white"
          style={{ height: computeHeight(phases.length, tasks.length) }}
        />
      )}
    </div>
  );
}

function computeRange(ganttData: unknown[]) {
  const dates = ganttData
    .map((t) => {
      const task = t as { start_date?: Date; end_date?: Date };
      return task.start_date && task.end_date ? [new Date(task.start_date), new Date(task.end_date)] : [];
    })
    .flat()
    .filter(Boolean) as Date[];
  if (!dates.length) return { min: new Date(), max: new Date() };
  return {
    min: new Date(Math.min(...dates.map((d) => d.getTime()))),
    max: new Date(Math.max(...dates.map((d) => d.getTime()))),
  };
}

function clampDate(d: Date, min: Date, max: Date): Date {
  if (d < min) return new Date(min);
  if (d > max) return new Date(max);
  return new Date(d);
}
