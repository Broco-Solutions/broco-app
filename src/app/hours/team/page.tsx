import { requireRole } from "@/lib/auth";
import { prisma } from "@/server/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { saveTeamMember, toggleTeamMember, assignProject, createActivationLink } from "./actions";

export const dynamic = "force-dynamic";
export default async function HoursTeamPage() {
  await requireRole("ADMIN");
  const [users, projects] = await Promise.all([
    prisma.appUser.findMany({ orderBy: { name: "asc" }, include: { assignments: { select: { projectId: true } } } }),
    prisma.project.findMany({ where: { isActive: true }, select: { id: true, name: true, client: { select: { name: true } } }, orderBy: [{ client: { name: "asc" } }, { name: "asc" }] }),
  ]);
  return <div className="space-y-6"><PageHeader eyebrow="Horas" title="Equipo" description="Administrá accesos, estados y asignaciones de proyectos." meta={null} />
    <Card><form action={saveTeamMember} className="grid gap-3 md:grid-cols-4"><input name="name" required placeholder="Nombre" className="h-10 rounded-lg border border-gray-200 px-3 text-sm" /><input name="email" required type="email" placeholder="Correo" className="h-10 rounded-lg border border-gray-200 px-3 text-sm" /><select name="role" className="h-10 rounded-lg border border-gray-200 px-3 text-sm"><option value="COLLABORATOR">Colaborador</option><option value="ADMIN">Administrador</option></select><Button type="submit">Agregar persona</Button></form></Card>
    <div className="grid gap-4">{users.map((user) => <Card key={user.id}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{user.name}</h2><p className="text-sm text-gray-500">{user.email} · {user.role === "ADMIN" ? "Administrador" : "Colaborador"} · {user.isActive ? "Activo" : "Pendiente / inactivo"}</p></div><div className="flex gap-2"><form action={toggleTeamMember}><input type="hidden" name="id" value={user.id} /><input type="hidden" name="active" value={String(user.isActive)} /><Button variant="secondary" type="submit">{user.isActive ? "Desactivar" : "Activar"}</Button></form>{!user.isActive ? <form action={createActivationLink}><input type="hidden" name="userId" value={user.id} /><Button type="submit" variant="ghost">Generar enlace seguro</Button></form> : null}</div></div><div className="mt-4 grid gap-2 md:grid-cols-2">{projects.map((project) => { const assigned = user.assignments.some((a) => a.projectId === project.id); return <form key={project.id} action={assignProject} className="flex items-center justify-between rounded-lg border border-gray-100 p-2 text-sm"><span><span className="font-medium">{project.client.name}</span> · {project.name}</span><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="projectId" value={project.id} /><input type="hidden" name="assigned" value={String(assigned)} /><Button type="submit" variant={assigned ? "secondary" : "ghost"} className="text-xs">{assigned ? "Quitar" : "Asignar"}</Button></form>; })}</div></Card>)}</div>
  </div>;
}
