import { requireUser } from "@/lib/auth";
import { todayKeyArgentina } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import {
  listOperationalTaskAssignees,
  listOperationalTaskProjectOptions,
  listOperationalTasks,
} from "@/server/services/operational-tasks";
import { TaskList } from "./task-list";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const actor = await requireUser();
  const [tasks, projects, assignees] = await Promise.all([
    listOperationalTasks(actor),
    listOperationalTaskProjectOptions(actor),
    listOperationalTaskAssignees(actor),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operación"
        title={actor.role === "ADMIN" ? "Tareas" : "Mis tareas"}
        description={actor.role === "ADMIN" ? "Seguí y administrá el trabajo operativo del equipo." : "Organizá tu trabajo cotidiano y registrá tus avances."}
        meta={null}
      />
      <TaskList
        initialTasks={JSON.parse(JSON.stringify(tasks))}
        actor={{ id: actor.id, role: actor.role }}
        projects={JSON.parse(JSON.stringify(projects.map((project) => ({ ...project, isActive: true }))))}
        assignees={JSON.parse(JSON.stringify(assignees))}
        today={todayKeyArgentina()}
      />
    </div>
  );
}
