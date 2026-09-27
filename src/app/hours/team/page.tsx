import { requireRole } from "@/lib/auth";
import { prisma } from "@/server/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import { assignProject } from "./actions";

export const dynamic = "force-dynamic";
export default async function HoursTeamPage() {
  await requireRole("ADMIN");
  const [users, projects] = await Promise.all([
    prisma.appUser.findMany({ where: { role: "COLLABORATOR" }, orderBy: { name: "asc" }, include: { assignments: { select: { projectId: true } } } }),
    prisma.project.findMany({ where: { isActive: true }, select: { id: true, name: true, client: { select: { name: true } } }, orderBy: [{ client: { name: "asc" } }, { name: "asc" }] }),
  ]);
  return <div className="space-y-6"><PageHeader eyebrow="Tiempos" title="Asignaciones" description="Definí qué proyectos puede usar cada colaborador para registrar tiempo." meta={<Link href="/users" className="text-sm font-medium text-brand hover:underline">Administrar usuarios →</Link>} />
    {users.length === 0 ? <EmptyState title="No hay colaboradores" description="Creá un usuario colaborador desde Usuarios para asignarle proyectos." /> : <div className="grid gap-4">{users.map((user) => <Card key={user.id}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{user.name}</h2><p className="text-sm text-gray-500">{user.isActive ? "Colaborador activo" : "Colaborador inactivo"}</p></div></div><div className="mt-4 grid gap-2 md:grid-cols-2">{projects.map((project) => { const assigned = user.assignments.some((a) => a.projectId === project.id); return <form key={project.id} action={assignProject} className="flex items-center justify-between rounded-lg border border-gray-100 p-2 text-sm"><span><span className="font-medium">{project.client.name}</span> · {project.name}</span><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="projectId" value={project.id} /><input type="hidden" name="assigned" value={String(assigned)} /><Button type="submit" variant={assigned ? "secondary" : "ghost"} className="text-xs">{assigned ? "Quitar" : "Asignar"}</Button></form>; })}</div></Card>)}</div>}
  </div>;
}
