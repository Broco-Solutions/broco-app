import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/server/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { ProjectAccessPanel } from "./project-access-panel";

export const dynamic = "force-dynamic";

export default async function UserProjectAccessPage({ params }: { params: { id: string } }) {
  await requireRole("ADMIN");
  const [user, projects] = await Promise.all([
    prisma.appUser.findUnique({ where: { id: params.id }, select: { id: true, name: true, email: true, role: true, isActive: true, projectAccess: { select: { projectId: true } } } }),
    prisma.project.findMany({ where: { isActive: true }, select: { id: true, name: true, isInternal: true, client: { select: { id: true, name: true } } }, orderBy: [{ client: { name: "asc" } }, { name: "asc" }] }),
  ]);
  if (!user || user.role !== "COLLABORATOR") notFound();
  return <div className="space-y-6">
    <PageHeader eyebrow="Administración · Usuarios" title={`Proyectos de ${user.name}`} description="Definí en qué proyectos puede trabajar esta persona. El acceso aplica a Tiempos y Tareas Operativas." meta={<Link href="/users" className="text-sm font-medium text-brand hover:underline">← Volver a usuarios</Link>} />
    <ProjectAccessPanel user={JSON.parse(JSON.stringify({ ...user, projectIds: user.projectAccess.map((access) => access.projectId) }))} projects={JSON.parse(JSON.stringify(projects))} />
  </div>;
}
