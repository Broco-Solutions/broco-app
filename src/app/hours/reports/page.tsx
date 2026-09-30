import { requireRole } from "@/lib/auth";
import { getHourReport, formatMinutes, listHourOptions } from "@/server/services/hours";
import { prisma } from "@/server/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { ReportsFilters } from "./reports-filters";
import { todayKeyArgentina, toUtcDate } from "@/lib/dates";

export const dynamic = "force-dynamic";
function month() { const now = toUtcDate(todayKeyArgentina()); return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) }; }
function Metric({ title, value, detail }: { title: string; value: string | number; detail: string }) { return <Card className="min-h-32 bg-gradient-to-br from-ink to-cobalt text-white"><p className="text-xs font-semibold uppercase tracking-wider text-white/70">{title}</p><p className="mt-4 text-3xl font-semibold">{value}</p><p className="mt-1 text-sm text-white/70">{detail}</p></Card>; }

export default async function HoursReportsPage({ searchParams }: { searchParams?: { from?: string; to?: string; clientId?: string; projectId?: string; userId?: string } }) {
  const actor = await requireRole("ADMIN");
  const d = month();
  const [options, users] = await Promise.all([listHourOptions(actor), prisma.appUser.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })]);
  const filters = { from: searchParams?.from ?? d.from, to: searchParams?.to ?? d.to, clientId: searchParams?.clientId, projectId: searchParams?.projectId, userId: searchParams?.userId };
  const report = await getHourReport(actor, filters);
  const clients = [...new Map(options.map((p) => [p.client.id, { id: p.client.id, name: p.client.name }])).values()];
  return <div className="space-y-6">
    <PageHeader eyebrow="Tiempos" title="Reportes" description="Análisis global de tiempos registrados en el período filtrado." meta={null} />
    <ReportsFilters filters={filters} isAdmin clients={clients} projects={options} users={users} />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric title="Horas registradas" value={formatMinutes(report.kpis.minutes)} detail="Período" /><Metric title="Días con registros" value={report.kpis.days} detail="Fechas distintas" /><Metric title="Proyectos con actividad" value={report.kpis.projects} detail="Proyectos" /><Metric title="Usuarios con registros" value={report.kpis.users} detail="Equipo" /></div>
    <Card><h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Resumen por cliente y proyecto</h2><DataTable tableClassName="table-fixed" colGroup={<colgroup><col style={{width:"35%"}} /><col style={{width:"35%"}} /><col style={{width:"15%"}} /><col style={{width:"15%"}} /></colgroup>} headers={["Cliente", "Proyecto", "Registros", "Horas registradas"]}>{report.byClientProject.map((row) => <tr key={`${row.clientName}-${row.projectName}`}><td className="px-3 py-2.5 truncate" title={row.clientName}>{row.clientName}</td><td className="px-3 py-2.5 truncate" title={row.projectName}>{row.projectName}</td><td className="px-3 py-2.5 text-right tabular-nums">{row.entries}</td><td className="px-3 py-2.5 text-right tabular-nums">{formatMinutes(row.minutes)}</td></tr>)}</DataTable></Card>
    <Card><h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Resumen por usuario</h2><DataTable tableClassName="table-fixed" colGroup={<colgroup><col style={{width:"55%"}} /><col style={{width:"20%"}} /><col style={{width:"25%"}} /></colgroup>} headers={["Usuario", "Registros", "Horas registradas"]}>{report.byUser.map((row) => <tr key={row.userName}><td className="px-3 py-2.5 truncate" title={row.userName}>{row.userName}</td><td className="px-3 py-2.5 text-right tabular-nums">{row.entries}</td><td className="px-3 py-2.5 text-right tabular-nums">{formatMinutes(row.minutes)}</td></tr>)}</DataTable></Card>
  </div>;
}
