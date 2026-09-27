import { requireUser } from "@/lib/auth";
import { getHourReport, listHourOptions } from "@/server/services/hours";
import { prisma } from "@/server/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { HoursScreen } from "./hours-screen";
import { HoursMetrics } from "./hours-metrics";
import { ReportsFilters } from "./reports/reports-filters";

export const dynamic = "force-dynamic";

function week() {
  const now = new Date();
  const day = (now.getUTCDay() + 6) % 7;
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default async function HoursPage({ searchParams }: { searchParams?: { from?: string; to?: string; clientId?: string; projectId?: string; userId?: string; workDate?: string; saved?: string } }) {
  const actor = await requireUser();
  const range = week();
  const filters = { from: searchParams?.from ?? range.from, to: searchParams?.to ?? range.to, clientId: searchParams?.clientId, projectId: searchParams?.projectId, userId: actor.role === "ADMIN" ? searchParams?.userId : actor.id };
  const [projects, report, users] = await Promise.all([
    listHourOptions(actor),
    getHourReport(actor, filters),
    actor.role === "ADMIN" ? prisma.appUser.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const clients = [...new Map(projects.map((p) => [p.client.id, { id: p.client.id, name: p.client.name }])).values()];
  return <div className="space-y-6">
    <PageHeader eyebrow="Tiempos" title="Registros" description="Cargá y consultá tiempos registrados por cliente y proyecto." meta={null} />
    <HoursMetrics report={report.kpis} />
    <ReportsFilters filters={filters} isAdmin={actor.role === "ADMIN"} clients={clients} projects={projects} users={users} path="/hours" />
    <HoursScreen actor={actor} users={JSON.parse(JSON.stringify(users))} projects={JSON.parse(JSON.stringify(projects))} entries={JSON.parse(JSON.stringify(report.entries))} defaultFrom={filters.from} defaultTo={filters.to} initialClientId={filters.clientId} initialProjectId={filters.projectId} initialWorkDate={searchParams?.workDate} saved={searchParams?.saved === "1"} />
  </div>;
}
