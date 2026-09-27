import { listIncomes } from "@/server/services/incomes";
import { listProjects } from "@/server/services/projects";
import { listClients } from "@/server/services/clients";
import { listIncomeTypes } from "@/server/services/income-types";
import { PageHeader } from "@/components/ui/page-header";
import { IncomeList } from "./income-list";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function IncomesPage() {
  await requireRole("ADMIN");
  const [incomes, projects, clients, incomeTypes] = await Promise.all([
    listIncomes().catch(() => []),
    listProjects().catch(() => []),
    listClients().catch(() => []),
    listIncomeTypes().catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Ingresos" title="Ingresos" description="" meta={null} />
      <IncomeList
        initialIncomes={JSON.parse(JSON.stringify(incomes))}
        projects={JSON.parse(JSON.stringify(projects.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId }))))}
        clients={JSON.parse(JSON.stringify(clients.map((c) => ({ id: c.id, name: c.name }))))}
        incomeTypes={JSON.parse(JSON.stringify(incomeTypes.map((t) => ({ id: t.id, name: t.name, requiresProject: t.requiresProject }))))}
      />
    </div>
  );
}
