import Image from "next/image";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { CalendarClock, CalendarRange, CheckCircle2, Clock3, ExternalLink, Flag, FolderOpen, UserRound } from "lucide-react";
import {
  resolveShareGateBySlug,
  authorizeClientAccess,
  getAuthorizedProjectPlan,
} from "@/server/services/project-sharing";
import {
  computeProjectProgress,
  computeElapsedPercent,
  resolveGoLive,
} from "@/lib/project-progress";
import { ProjectGantt } from "@/components/projects/dhtmlx/project-gantt";
import { TaskStatusLegend } from "@/components/projects/task-status-legend";
import { PortalPasswordGate } from "./portal-password-gate";
import { PortalLogoutButton } from "./portal-logout-button";

export const dynamic = "force-dynamic";

function fmtLong(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const day = date.getUTCDate();
  const month = date.toLocaleString("es-AR", { month: "long", timeZone: "UTC" });
  return `${day} de ${month} de ${date.getUTCFullYear()}`;
}

function goLiveText(g: { hasDate: boolean; daysRemaining: number | null; isToday: boolean }): string | null {
  if (!g.hasDate) return null;
  if (g.isToday) return "Hoy";
  if (g.daysRemaining != null && g.daysRemaining < 0) return `Hace ${-g.daysRemaining} días`;
  return `${g.daysRemaining} días`;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const gate = await resolveShareGateBySlug(params.slug);
  return {
    title: gate ? `${gate.projectName} | Broco Solutions` : "Broco Solutions",
    robots: { index: false, follow: false },
  };
}

export default async function PortalPage({ params }: { params: { slug: string } }) {
  const gate = await resolveShareGateBySlug(params.slug);

  if (!gate) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#f8fafc] to-white px-4">
        <p className="text-center text-ink/60">Este enlace no está disponible.</p>
      </main>
    );
  }

  const session = cookies().get("portal_session")?.value ?? null;
  const auth = await authorizeClientAccess(params.slug, session);

  if (!auth) {
    return (
      <PortalPasswordGate slug={params.slug} projectName={gate.projectName} clientName={gate.clientName} />
    );
  }

  const plan = await getAuthorizedProjectPlan(params.slug, session);

  if (!plan) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#f8fafc] to-white px-4">
        <p className="text-center text-ink/60">Este enlace no está disponible.</p>
      </main>
    );
  }

  const progress = computeProjectProgress(plan.tasks);
  const elapsed = computeElapsedPercent(plan.startDate, plan.endDate);
  const goLive = resolveGoLive(plan.goLiveDate);
  const goLiveValue = goLiveText(goLive);

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-white via-slate-50 to-blue-50/60" />
        <div className="absolute -top-32 -right-32 h-[520px] w-[520px] rounded-full bg-blue-100/40 blur-[80px]" />
        <div className="absolute top-[18%] -left-24 h-[380px] w-[380px] rounded-full bg-cobalt/8 blur-[70px]" />
        <div className="absolute bottom-0 right-0 hidden select-none text-[18rem] font-black leading-none tracking-tighter text-slate-900/[0.03] lg:block" aria-hidden>
          BS
        </div>
      </div>

      <div className="relative">
        <header className="border-b border-white/10 bg-gradient-to-br from-slate-950 via-ink to-cobalt/90">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-6 md:py-5">
            <div className="flex items-center gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/10 p-2 ring-1 ring-white/15 backdrop-blur">
                <Image
                  src="/Icono%20BS%20-%20Negativo.png"
                  alt="Broco Solutions"
                  width={40}
                  height={40}
                  className="h-full w-full object-contain"
                  priority
                />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">Broco Solutions</p>
                <h1 className="mt-0.5 font-display text-lg font-semibold leading-none tracking-[-0.01em] text-white md:text-xl">Seguimiento de proyecto</h1>
              </div>
            </div>
            <PortalLogoutButton slug={params.slug} />
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
          <div className="mb-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-cobalt/20 bg-cobalt/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cobalt">
              <span className="h-1.5 w-1.5 rounded-full bg-cobalt" /> Proyecto activo
            </div>
            <h2 className="mt-3 font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] text-ink md:text-4xl">{plan.name}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <UserRound className="h-4 w-4 text-slate-400" strokeWidth={1.8} />
                {plan.client.name}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarRange className="h-4 w-4 text-slate-400" strokeWidth={1.8} />
                {fmtLong(plan.startDate)} — {fmtLong(plan.endDate)}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <Clock3 className="h-3.5 w-3.5" strokeWidth={1.8} />
                Actualizado {fmtLong(plan.updatedAt)}
              </span>
            </div>
          </div>

          <section className="grid gap-4 sm:grid-cols-3">
            <MetricCard
              icon={CheckCircle2}
              label="Avance completado"
              value={progress.hasTasks ? `${progress.percent}%` : "—"}
              sub={progress.hasTasks ? `${progress.percent}% del trabajo` : "Sin tareas cargadas"}
              progress={progress.hasTasks ? progress.percent : null}
              accent="text-emerald-600"
            />
            <MetricCard
              icon={Clock3}
              label="Tiempo transcurrido"
              value={elapsed === null ? "—" : `${elapsed}%`}
              sub={elapsed === null ? "Sin fechas definidas" : `${elapsed}% del plazo`}
              progress={elapsed}
              accent="text-cobalt"
            />
            <MetricCard
              icon={Flag}
              label="Go Live"
              value={goLiveValue ?? "—"}
              sub={goLiveValue ? (goLive.isToday ? "Hoy" : goLive.daysRemaining != null && goLive.daysRemaining < 0 ? "Fecha superada" : "Fecha objetivo") : "Sin fecha definida"}
              accent={goLive.isToday ? "text-emerald-600" : "text-amber-600"}
            />
          </section>

          {plan.clientSharedFolderUrl && (
            <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
              <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 md:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-900 to-cobalt text-white shadow-sm">
                    <FolderOpen className="h-5 w-5" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-semibold leading-none text-ink">
                      Documentación del proyecto
                    </h2>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {plan.clientSharedFolderLabel ?? "Abrir carpeta compartida"}
                    </p>
                  </div>
                </div>
                <a
                  href={plan.clientSharedFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-cobalt px-4 py-2 text-sm font-medium text-white transition hover:bg-cobalt/90"
                >
                  {plan.clientSharedFolderLabel ?? "Abrir carpeta compartida"}
                  <ExternalLink className="h-4 w-4" strokeWidth={1.8} />
                </a>
              </div>
            </section>
          )}

          <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-slate-50/60 px-5 py-4 md:px-6">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-slate-900 to-cobalt text-white shadow-sm">
                  <CalendarClock className="h-5 w-5" strokeWidth={1.8} />
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold leading-none text-ink">Cronograma</h2>
                  <p className="mt-1 text-xs text-slate-500">Planificación detallada y estado por tarea.</p>
                </div>
              </div>
              <div className="w-full sm:w-auto">
                <TaskStatusLegend />
              </div>
            </div>
            <div className="p-4 md:p-6">
              {plan.tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
                    <CalendarClock className="h-6 w-6" strokeWidth={1.6} />
                  </div>
                  <h3 className="mt-4 font-display text-base font-semibold text-ink">Cronograma en preparación</h3>
                  <p className="mt-1.5 max-w-sm text-sm leading-6 text-slate-500">El equipo de Broco Solutions actualizará la planificación y la tendrás disponible aquí para seguir el avance.</p>
                </div>
              ) : (
                <ProjectGantt
                  phases={JSON.parse(JSON.stringify(plan.phases))}
                  tasks={JSON.parse(JSON.stringify(plan.tasks))}
                  projectId={plan.id}
                  portal
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function MetricCard({ icon: Icon, label, value, sub, progress, accent }: { icon: any; label: string; value: string; sub?: string; progress?: number | null; accent?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 ring-1 ring-slate-100 ${accent ?? "text-slate-400"}`}>
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </div>
      </div>
      <div className="mt-2 font-display text-3xl font-semibold tracking-[-0.02em] text-ink">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
      {progress != null && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full transition-all ${accent ?? "bg-cobalt"}`} style={{ width: `${Math.min(100, Math.max(0, progress))}%`, backgroundColor: accent === "text-emerald-600" ? "#16a34a" : accent === "text-cobalt" ? "#2563eb" : undefined }} />
        </div>
      )}
    </div>
  );
}
