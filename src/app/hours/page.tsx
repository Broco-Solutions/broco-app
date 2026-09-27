import { requireUser } from "@/lib/auth";
import { listHourOptions, listTimeEntries } from "@/server/services/hours";
import { PageHeader } from "@/components/ui/page-header";
import { HoursScreen } from "./hours-screen";

export const dynamic = "force-dynamic";
function week() { const now = new Date(); const day = (now.getUTCDay() + 6) % 7; const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day)); const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }; }

export default async function HoursPage() {
  const actor = await requireUser(); const range = week();
  const [projects, entries, users] = await Promise.all([listHourOptions(actor), listTimeEntries(actor, range), actor.role === "ADMIN" ? (await import("@/server/prisma")).prisma.appUser.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([])]);
  return <div className="space-y-6"><PageHeader eyebrow="Horas" title="Registros" description="Cargá y consultá horas registradas por cliente y proyecto." meta={null} /><HoursScreen actor={actor} users={JSON.parse(JSON.stringify(users))} projects={JSON.parse(JSON.stringify(projects))} entries={JSON.parse(JSON.stringify(entries))} defaultFrom={range.from} defaultTo={range.to} /></div>;
}
