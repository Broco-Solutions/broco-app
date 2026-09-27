import { listExpenses } from "@/server/services/expenses";
import { listCategories } from "@/server/services/expense-categories";
import { listProjects } from "@/server/services/projects";
import { listClients } from "@/server/services/clients";
import { PageHeader } from "@/components/ui/page-header";
import { ExpenseList } from "./expense-list";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  await requireRole("ADMIN");
  const [expenses, categories, projects, clients] = await Promise.all([
    listExpenses().catch(() => []),
    listCategories().catch(() => []),
    listProjects().catch(() => []),
    listClients().catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Gastos" title="Gastos" description="" meta={null} />
      <ExpenseList
        initial={JSON.parse(JSON.stringify(expenses))}
        categories={JSON.parse(JSON.stringify(categories))}
        projects={JSON.parse(JSON.stringify(projects.map((p: { id: string; name: string; clientId?: string }) => ({ id: p.id, name: p.name, clientId: p.clientId }))))}
        clients={JSON.parse(JSON.stringify(clients.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))))}
      />
    </div>
  );
}
