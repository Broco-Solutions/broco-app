"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Circle, Clock3, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select } from "@/components/ui/select";
import { SortableHeader } from "@/components/ui/sortable-header";
import { OperationalTaskStatusBadge } from "@/components/tasks/operational-task-status";
import { formatDate, formatDateShort } from "@/lib/dates";
import {
  compareOperationalTasks,
  toggleOperationalTaskSort,
  type OperationalTaskClientSort,
  type OperationalTaskSortKey,
} from "@/lib/operational-task-order";
import { TaskDetailModal } from "./task-detail-modal";
import { TaskFormModal } from "./task-form-modal";
import { TaskTimeModal } from "./task-time-modal";
import type { OperationalTaskDTO, TaskAssigneeOption, TaskProjectOption } from "./types";

type StatusFilter = "OPEN" | "ALL" | "PENDING" | "IN_PROGRESS" | "BLOCKED" | "DONE";
type DueFilter = "ALL" | "OVERDUE" | "TODAY" | "NEXT_7_DAYS" | "NO_DUE";

function isOverdue(task: OperationalTaskDTO, today: string) {
  return Boolean(task.dueDate && task.dueDate.slice(0, 10) < today && task.status !== "DONE");
}

function plusDays(key: string, days: number) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function TaskList({
  initialTasks,
  actor,
  projects,
  assignees,
  today,
}: {
  initialTasks: OperationalTaskDTO[];
  actor: { id: string; role: "ADMIN" | "COLLABORATOR" };
  projects: TaskProjectOption[];
  assignees: TaskAssigneeOption[];
  today: string;
}) {
  const isAdmin = actor.role === "ADMIN";
  const [tasks, setTasks] = useState(initialTasks);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("OPEN");
  const [due, setDue] = useState<DueFilter>("ALL");
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [sort, setSort] = useState<OperationalTaskClientSort>("auto");
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<OperationalTaskDTO | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timeTaskId, setTimeTaskId] = useState<string | null>(null);

  useEffect(() => setTasks(initialTasks), [initialTasks]);

  const selectedTask = tasks.find((task) => task.id === selectedId) ?? null;
  const timeTask = tasks.find((task) => task.id === timeTaskId) ?? null;
  const allProjects = useMemo(() => {
    const map = new Map(projects.map((project) => [project.id, project]));
    for (const task of tasks) if (task.project) map.set(task.project.id, task.project);
    return [...map.values()].sort((a, b) => `${a.client.name} ${a.name}`.localeCompare(`${b.client.name} ${b.name}`, "es-AR"));
  }, [projects, tasks]);
  const clients = useMemo(() => [...new Map(allProjects.map((project) => [project.client.id, project.client])).values()], [allProjects]);
  const filteredProjectOptions = allProjects
    .filter((project) => !clientId || project.client.id === clientId)
    .map((project) => ({ id: project.id, name: `${project.client.name} · ${project.name}` }));

  const indicators = useMemo(() => ({
    pending: tasks.filter((task) => task.status === "PENDING").length,
    inProgress: tasks.filter((task) => task.status === "IN_PROGRESS").length,
    blocked: tasks.filter((task) => task.status === "BLOCKED").length,
    overdue: tasks.filter((task) => isOverdue(task, today)).length,
    done: tasks.filter((task) => task.status === "DONE").length,
  }), [tasks, today]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es-AR");
    const nextWeek = plusDays(today, 7);
    return tasks
      .filter((task) => {
        if (status === "OPEN" && task.status === "DONE") return false;
        if (status !== "ALL" && status !== "OPEN" && task.status !== status) return false;
        if (clientId && task.project?.client.id !== clientId) return false;
        if (projectId && task.projectId !== projectId) return false;
        if (isAdmin && assigneeId && task.assigneeId !== assigneeId) return false;
        const date = task.dueDate?.slice(0, 10) ?? null;
        if (due === "OVERDUE" && !isOverdue(task, today)) return false;
        if (due === "TODAY" && date !== today) return false;
        if (due === "NEXT_7_DAYS" && (!date || date < today || date > nextWeek || task.status === "DONE")) return false;
        if (due === "NO_DUE" && date !== null) return false;
        if (query) {
          const haystack = [task.title, task.description, task.blockedReason, task.project?.name, task.project?.client.name, task.assignee.name]
            .filter(Boolean).join(" ").toLocaleLowerCase("es-AR");
          if (!haystack.includes(query)) return false;
        }
        return true;
      })
      .sort((a, b) => compareOperationalTasks(a, b, sort));
  }, [assigneeId, clientId, due, isAdmin, projectId, search, sort, status, tasks, today]);

  const quickFilters = [
    { label: "Pendientes", value: indicators.pending, icon: Circle, active: status === "PENDING", onClick: () => { setStatus("PENDING"); setDue("ALL"); } },
    { label: "En progreso", value: indicators.inProgress, icon: PlayCircle, active: status === "IN_PROGRESS", onClick: () => { setStatus("IN_PROGRESS"); setDue("ALL"); } },
    { label: "Bloqueadas", value: indicators.blocked, icon: AlertCircle, active: status === "BLOCKED", onClick: () => { setStatus("BLOCKED"); setDue("ALL"); } },
    { label: "Vencidas", value: indicators.overdue, icon: Clock3, active: due === "OVERDUE", onClick: () => { setStatus("ALL"); setDue("OVERDUE"); } },
    { label: "Completadas", value: indicators.done, icon: CheckCircle2, active: status === "DONE", onClick: () => { setStatus("DONE"); setDue("ALL"); } },
  ];

  const sortHeader = (label: string, key: OperationalTaskSortKey) => (
    <SortableHeader label={label} sortKey={key} sort={sort} onSort={(next) => setSort((current) => toggleOperationalTaskSort(current, next))} />
  );

  const openEdit = (task: OperationalTaskDTO) => {
    setSelectedId(null);
    setEditingTask(task);
    setFormOpen(true);
  };
  const closeDetail = useCallback(() => setSelectedId(null), []);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-5">
        {quickFilters.map(({ label, value, icon: Icon, active, onClick }) => (
          <button key={label} type="button" onClick={onClick} className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${active ? "border-brand bg-brand/5 text-brand" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}>
            <span className="flex items-center gap-2 text-xs font-semibold"><Icon className="h-4 w-4" /> {label}</span>
            <span className="text-lg font-bold tabular-nums">{value}</span>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(180px,1.4fr),160px,minmax(170px,1fr),minmax(200px,1.2fr),160px,auto]">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tarea…" aria-label="Buscar tareas" />
          <Select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} aria-label="Estado">
            <option value="OPEN">Abiertas</option><option value="ALL">Todos los estados</option><option value="PENDING">Pendientes</option><option value="IN_PROGRESS">En progreso</option><option value="BLOCKED">Bloqueadas</option><option value="DONE">Completadas</option>
          </Select>
          <SearchableSelect value={clientId} onChange={(value) => { setClientId(value); if (projectId && allProjects.find((project) => project.id === projectId)?.client.id !== value) setProjectId(""); }} options={clients} placeholder="Todos los clientes" />
          <SearchableSelect value={projectId} onChange={setProjectId} options={filteredProjectOptions} placeholder="Todos los proyectos" />
          {isAdmin ? <SearchableSelect value={assigneeId} onChange={setAssigneeId} options={assignees.map((user) => ({ id: user.id, name: user.name }))} placeholder="Responsable" /> : (
            <Select value={due} onChange={(event) => setDue(event.target.value as DueFilter)} aria-label="Vencimiento"><option value="ALL">Cualquier vencimiento</option><option value="OVERDUE">Vencidas</option><option value="TODAY">Vencen hoy</option><option value="NEXT_7_DAYS">Próximos 7 días</option><option value="NO_DUE">Sin vencimiento</option></Select>
          )}
          {isAdmin ? <Select value={due} onChange={(event) => setDue(event.target.value as DueFilter)} aria-label="Vencimiento"><option value="ALL">Cualquier vencimiento</option><option value="OVERDUE">Vencidas</option><option value="TODAY">Vencen hoy</option><option value="NEXT_7_DAYS">Próximos 7 días</option><option value="NO_DUE">Sin vencimiento</option></Select> : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gray-500">{filtered.length} de {tasks.length} tareas · seleccioná una fila para abrir el detalle</p>
          <div className="flex gap-2">
            <Select value={sort} onChange={(event) => setSort(event.target.value as OperationalTaskClientSort)} aria-label="Orden" className="w-auto text-xs">
              <option value="auto">Orden recomendado</option>
              <option value="due-asc">Vencimiento próximo</option><option value="due-desc">Vencimiento lejano</option>
              <option value="created-desc">Creación reciente</option><option value="created-asc">Creación antigua</option>
              <option value="updated-desc">Actualización reciente</option><option value="updated-asc">Actualización antigua</option>
              <option value="status-asc">Estado</option>
              {isAdmin ? <option value="assignee-asc">Responsable A–Z</option> : null}
            </Select>
            <Button type="button" variant="ghost" className="text-xs" onClick={() => { setSearch(""); setStatus("OPEN"); setDue("ALL"); setClientId(""); setProjectId(""); setAssigneeId(""); setSort("auto"); }}>Limpiar filtros</Button>
            <Button type="button" onClick={() => { setEditingTask(null); setFormOpen(true); }}>+ Nueva tarea</Button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? <EmptyState title="No hay tareas para estos filtros" description="Probá limpiar los filtros o creá una nueva tarea operativa." /> : (
        <>
          <div className="hidden md:block">
            <DataTable
              tableClassName="table-fixed"
              headers={isAdmin
                ? [sortHeader("Estado", "status"), "Tarea", "Cliente", "Proyecto", sortHeader("Responsable", "assignee"), sortHeader("Vencimiento", "due"), "Tiempo", sortHeader("Actualización", "updated")]
                : [sortHeader("Estado", "status"), "Tarea", "Cliente", "Proyecto", sortHeader("Vencimiento", "due"), "Tiempo", sortHeader("Actualización", "updated")]}
              colGroup={isAdmin
                ? <colgroup><col style={{width:"11%"}} /><col style={{width:"21%"}} /><col style={{width:"13%"}} /><col style={{width:"14%"}} /><col style={{width:"13%"}} /><col style={{width:"10%"}} /><col style={{width:"8%"}} /><col style={{width:"10%"}} /></colgroup>
                : <colgroup><col style={{width:"13%"}} /><col style={{width:"27%"}} /><col style={{width:"15%"}} /><col style={{width:"16%"}} /><col style={{width:"11%"}} /><col style={{width:"8%"}} /><col style={{width:"10%"}} /></colgroup>}
            >
              {filtered.map((task) => {
                const overdue = isOverdue(task, today);
                return (
                  <tr key={task.id} tabIndex={0} role="button" aria-label={`Abrir tarea ${task.title}`} className="cursor-pointer transition hover:bg-cobalt/[0.035] focus-visible:bg-cobalt/[0.06] focus-visible:outline-none" onClick={() => setSelectedId(task.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(task.id); } }}>
                    <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1"><OperationalTaskStatusBadge status={task.status} />{overdue ? <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Vencida</span> : null}</div></td>
                    <td className="px-3 py-2.5"><div className="line-clamp-2 break-words font-medium text-ink" title={task.title}>{task.title}</div></td>
                    <td className="px-3 py-2.5"><div className="truncate" title={task.project?.client.name}>{task.project?.client.name ?? "—"}</div></td>
                    <td className="px-3 py-2.5"><div className="truncate" title={task.project?.name}>{task.project?.name ?? "—"}</div></td>
                    {isAdmin ? <td className="px-3 py-2.5"><div className="truncate" title={task.assignee.name}>{task.assignee.name}</div></td> : null}
                    <td className={`whitespace-nowrap px-3 py-2.5 tabular-nums ${overdue ? "font-semibold text-red-700" : ""}`}>{formatDateShort(task.dueDate)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs font-semibold tabular-nums text-gray-700">{task.timeMinutes > 0 ? `${Math.floor(task.timeMinutes / 60)} h ${task.timeMinutes % 60} min` : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-gray-500">{formatDateShort(task.updatedAt)}</td>
                  </tr>
                );
              })}
            </DataTable>
          </div>
          <div className="space-y-2 md:hidden">
            {filtered.map((task) => {
              const overdue = isOverdue(task, today);
              return (
                <button key={task.id} type="button" onClick={() => setSelectedId(task.id)} className="w-full rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm">
                  <div className="flex items-start justify-between gap-3"><span className="break-words text-sm font-semibold text-ink">{task.title}</span><OperationalTaskStatusBadge status={task.status} /></div>
                  <p className="mt-2 truncate text-xs text-gray-500">{task.project ? `${task.project.client.name} · ${task.project.name}` : "Tarea general"}</p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs"><span className={overdue ? "font-semibold text-red-700" : "text-gray-500"}>{overdue ? "Vencida · " : ""}{formatDate(task.dueDate)}</span>{isAdmin ? <span className="truncate text-gray-500">{task.assignee.name}</span> : null}</div>
                </button>
              );
            })}
          </div>
        </>
      )}

      <TaskDetailModal task={selectedTask} isAdmin={isAdmin} today={today} onClose={closeDetail} onEdit={() => selectedTask && openEdit(selectedTask)} onRegisterTime={() => selectedTask && setTimeTaskId(selectedTask.id)} />
      <TaskFormModal open={formOpen} task={editingTask} isAdmin={isAdmin} actorId={actor.id} projects={allProjects} assignees={assignees} onClose={() => { setFormOpen(false); setEditingTask(null); }} />
      <TaskTimeModal task={timeTask} today={today} onClose={() => setTimeTaskId(null)} />
    </div>
  );
}
