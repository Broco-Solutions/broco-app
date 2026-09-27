import { Card } from "@/components/ui/card";

export function HoursMetrics({ report }: { report: { minutes: number; days: number; projects: number } }) {
  const cards = [
    ["Horas registradas", `${Math.floor(report.minutes / 60)} h${report.minutes % 60 ? ` ${report.minutes % 60} min` : ""}`, "Período"],
    ["Días con registros", report.days, "Fechas distintas"],
    ["Proyectos con actividad", report.projects, "Proyectos"],
  ] as const;
  return <div className="grid gap-3 sm:grid-cols-3">{cards.map(([title, value, detail]) => <Card key={title} className="min-h-28 bg-gradient-to-br from-ink to-cobalt text-white"><p className="text-xs font-semibold uppercase tracking-wider text-white/70">{title}</p><p className="mt-3 text-2xl font-semibold">{value}</p><p className="mt-1 text-sm text-white/70">{detail}</p></Card>)}</div>;
}
