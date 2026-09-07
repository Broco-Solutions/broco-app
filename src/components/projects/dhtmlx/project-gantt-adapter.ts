import type { PhaseDTO, TaskDTO } from "./project-gantt-types";

export type GanttTaskType = "task" | "project" | "milestone";

export type GanttFilter = {
  type: "all" | "task" | "milestone";
  status: "all" | string;
};

function toDate(s: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!match) return new Date(s);
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function passesType(t: { type: string }, filter: GanttFilter): boolean {
  if (filter.type === "all") return true;
  const dType = t.type === "MILESTONE" ? "milestone" : "task";
  return dType === filter.type;
}

function passesStatus(t: { status: string }, filter: GanttFilter): boolean {
  if (filter.status === "all") return true;
  return t.status === filter.status;
}

function hasVisibleTask(
  phaseId: string,
  tasks: TaskDTO[],
  filter: GanttFilter,
): boolean {
  return tasks.some(
    (t) => t.phaseId === phaseId && passesType(t, filter) && passesStatus(t, filter),
  );
}

export function toDhtmlxData(
  phases: PhaseDTO[],
  tasks: TaskDTO[],
  filter: GanttFilter = { type: "all", status: "all" },
) {
  const sortedPhases = [...phases].sort((a, b) => a.position - b.position);
  const sortedTasks = [...tasks].sort((a, b) => a.position - b.position);

  const data: unknown[] = [];

  for (const phase of sortedPhases) {
    const pts = sortedTasks.filter((t) => t.phaseId === phase.id);
    if (pts.length === 0) continue;
    if (!hasVisibleTask(phase.id, sortedTasks, filter)) continue;

    data.push({
      id: phase.id,
      text: phase.name,
      type: "project",
      open: true,
      progress: 0,
    });

    for (const t of pts) {
      if (!passesType(t, filter) || !passesStatus(t, filter)) continue;
      const isMilestone = t.type === "MILESTONE";
      data.push({
        id: t.id,
        text: t.name,
        start_date: toDate(t.startDate),
        end_date: isMilestone ? toDate(t.startDate) : toDate(t.endDate),
        duration: isMilestone ? 0 : undefined,
        type: isMilestone ? "milestone" : "task",
        parent: phase.id,
        status: t.status,
        progress: 0,
        open: true,
      });
    }
  }

  for (const t of sortedTasks.filter((t) => !t.phaseId)) {
    if (!passesType(t, filter) || !passesStatus(t, filter)) continue;
    const isMilestone = t.type === "MILESTONE";
    data.push({
      id: t.id,
      text: t.name,
      start_date: toDate(t.startDate),
      end_date: isMilestone ? toDate(t.startDate) : toDate(t.endDate),
      duration: isMilestone ? 0 : undefined,
      type: isMilestone ? "milestone" : "task",
      parent: 0,
      status: t.status,
      progress: 0,
      open: true,
    });
  }

  return data;
}
