import { listProjects } from "@/server/services/projects";
import { listClients } from "@/server/services/clients";
import { PageHeader } from "@/components/ui/page-header";
import { ProjectList } from "./project-list";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  await requireRole("ADMIN");
  const [projects, clients] = await Promise.all([
    listProjects().catch(() => []),
    listClients().catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Proyectos" title="Proyectos" description="" meta={null} />
      <ProjectList
        initialProjects={JSON.parse(JSON.stringify(projects))}
        clients={JSON.parse(JSON.stringify(clients.map((c) => ({ id: c.id, name: c.name }))))}
      />
    </div>
  );
}
