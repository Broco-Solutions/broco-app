"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toggleProjectAccess } from "../project-access-actions";

type Project = { id: string; name: string; isInternal: boolean; client: { id: string; name: string } };
type User = { id: string; name: string; email: string; isActive: boolean; projectIds: string[] };

export function ProjectAccessPanel({ user, projects }: { user: User; projects: Project[] }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"ALL" | "ASSIGNED" | "UNASSIGNED">("ALL");
  const assigned = useMemo(() => new Set(user.projectIds), [user.projectIds]);
  const groups = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es-AR");
    const visible = projects.filter((project) => {
      const isAssigned = assigned.has(project.id);
      if (scope === "ASSIGNED" && !isAssigned) return false;
      if (scope === "UNASSIGNED" && isAssigned) return false;
      if (!normalized) return true;
      return `${project.client.name} ${project.name}`.toLocaleLowerCase("es-AR").includes(normalized);
    });
    return [...new Map(visible.map((project) => [project.client.id, { client: project.client, projects: [] as Project[] }])).values()].map((group) => ({ ...group, projects: visible.filter((project) => project.client.id === group.client.id) }));
  }, [assigned, projects, query, scope]);

  return <Card>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-semibold">Acceso a proyectos</h2><p className="mt-1 text-sm text-gray-500">{assigned.size} de {projects.length} proyectos habilitados · {user.email}</p></div>
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${user.isActive ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{user.isActive ? "Activo" : "Inactivo"}</span>
    </div>
    <div className="mt-5 grid gap-2 md:grid-cols-[minmax(0,1fr),180px]">
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente o proyecto…" aria-label="Buscar proyectos" />
      <select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)} aria-label="Filtrar acceso" className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm"><option value="ALL">Todos los proyectos</option><option value="ASSIGNED">Asignados</option><option value="UNASSIGNED">No asignados</option></select>
    </div>
    <div className="mt-5 space-y-5">
      {groups.length === 0 ? <p className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">No hay proyectos para este filtro.</p> : groups.map((group) => {
        const assignedInGroup = group.projects.filter((project) => assigned.has(project.id)).length;
        return <section key={group.client.id}><div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-ink">{group.client.name}</h3><span className="text-xs tabular-nums text-gray-500">{assignedInGroup} de {group.projects.length} asignados</span></div><div className="divide-y divide-gray-100 rounded-xl border border-gray-200">{group.projects.map((project) => { const isAssigned = assigned.has(project.id); return <form key={project.id} action={toggleProjectAccess} className="flex items-center justify-between gap-3 px-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-medium">{project.name}</p>{project.isInternal ? <p className="text-xs text-cobalt">Proyecto interno para imputaciones</p> : null}</div><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="projectId" value={project.id} /><input type="hidden" name="assigned" value={String(isAssigned)} /><Button type="submit" variant={isAssigned ? "secondary" : "ghost"} className="shrink-0 text-xs">{isAssigned ? "Quitar acceso" : "Habilitar"}</Button></form>; })}</div></section>;
      })}
    </div>
  </Card>;
}
