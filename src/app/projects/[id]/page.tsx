import Link from "next/link";
import { requireRole } from "@/lib/auth";
import type { ProjectPhase, ProjectTask } from "@prisma/client";
import { getProject } from "@/server/services/projects";
import { listPhases } from "@/server/services/project-phases";
import { listTasks } from "@/server/services/project-tasks";
import { getShareAccess } from "@/server/services/project-sharing";
import { listClients } from "@/server/services/clients";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatUsd, formatArs, formatDate } from "@/lib/utils";
import { ProjectPlanningView } from "./project-planning-view";
import { ProjectDetailEdit } from "./project-detail-edit";

export const dynamic = "force-dynamic";

function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  return d;
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  await requireRole("ADMIN");
  let project;
  try {
    project = await getProject(params.id);
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Proyecto" title="No encontrado" description="" meta={null} />
      </div>
    );
  }

  const tab = searchParams.tab === "planning" ? "planning" : "resumen";

  let phases: ProjectPhase[] = [];
  let tasks: ProjectTask[] = [];
  let shareAccess: { slug: string; revokedAt: Date | null } | null = null;
  let clients: { id: string; name: string }[] = [];
  if (tab === "planning") {
    const [phasesRes, tasksRes, link] = await Promise.all([
      listPhases(project.id).catch(() => []),
      listTasks(project.id).catch(() => []),
      getShareAccess(project.id).catch(() => null),
    ]);
    phases = phasesRes;
    tasks = tasksRes;
    shareAccess = link ? { slug: link.slug, revokedAt: link.revokedAt } : null;
  } else {
    const allClients = await listClients().catch(() => []);
    clients = allClients.map((c) => ({ id: c.id, name: c.name }));
  }

  const fmtAmt = (currency: string | null, usd: unknown, orig: unknown, rate: unknown) => {
    if (!currency) return "No configurado";
    const u = Number(usd ?? 0);
    if (currency === "USD") return formatUsd(u);
    const a = Number(orig ?? 0);
    const r = Number(rate ?? 0);
    return `${formatArs(a)} → ${formatUsd(u)} (TC ${r.toFixed(2)})`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Proyecto"
        title={project.name}
        description={`Cliente: ${project.client.name}`}
        meta={
          <Badge tone={project.isActive ? "success" : "neutral"}>
            {project.isActive ? "Activo" : "Inactivo"}
          </Badge>
        }
      />

      <div className="flex gap-1 border-b border-gray-200">
        <TabLink href={`/projects/${project.id}`} active={tab === "resumen"}>Resumen</TabLink>
        <TabLink href={`/projects/${project.id}?tab=planning`} active={tab === "planning"}>Planificación</TabLink>
      </div>

      {tab === "planning" ? (
        <ProjectPlanningView
          projectId={project.id}
          phases={JSON.parse(JSON.stringify(phases))}
          tasks={JSON.parse(JSON.stringify(tasks))}
          projectStartDate={iso(project.startDate)}
          projectEndDate={iso(project.endDate)}
          projectGoLiveDate={iso(project.goLiveDate)}
          shareAccess={shareAccess ? JSON.parse(JSON.stringify(shareAccess)) : null}
          clientSharedFolderUrl={project.clientSharedFolderUrl ?? null}
          clientSharedFolderLabel={project.clientSharedFolderLabel ?? null}
        />
      ) : (
        <>
          <div className="flex justify-end">
            <div className="flex flex-wrap justify-end gap-2">
              <Link href={`/clients/${project.clientId}`} className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
                Ver cliente
              </Link>
              <Link href={`/incomes?project=${project.id}`} className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
                Ver ingresos
              </Link>
              <Link href={`/expenses?project=${project.id}`} className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
                Ver gastos
              </Link>
              <ProjectDetailEdit project={JSON.parse(JSON.stringify(project))} clients={clients} />
            </div>
          </div>
          <Card>
            <h2 className="font-display text-xl text-ink">Datos del proyecto</h2>
            <div className="mt-4 space-y-2 text-sm">
              <p>
                <span className="text-ink/50">Cliente:</span>{" "}
                <Link href={`/clients/${project.clientId}`} className="text-cobalt underline">
                  {project.client.name}
                </Link>
              </p>
              <p><span className="text-ink/50">Inicio:</span> {project.startDate ? formatDate(project.startDate) : "—"}</p>
              <p><span className="text-ink/50">Fin:</span> {project.endDate ? formatDate(project.endDate) : "—"}</p>
              <p><span className="text-ink/50">Go Live:</span> {project.goLiveDate ? formatDate(project.goLiveDate) : "—"}</p>
              <p><span className="text-ink/50">Notas:</span> {project.notes ?? "—"}</p>
            </div>
          </Card>

          <Card>
            <h2 className="font-display text-xl text-ink">Importes</h2>
            <div className="mt-4 space-y-2 text-sm">
              <p>
                <span className="text-ink/50">Importe unico acordado:</span>{" "}
                {fmtAmt(
                  project.oneTimeCurrency,
                  project.oneTimeAmountUsd,
                  project.oneTimeOriginalAmount,
                  project.oneTimeExchangeRate,
                )}
              </p>
              <p>
                <span className="text-ink/50">Importe mensual informativo:</span>{" "}
                {fmtAmt(
                  project.monthlyRecurringCurrency,
                  project.monthlyRecurringAmountUsd,
                  project.monthlyRecurringOriginalAmount,
                  project.monthlyRecurringExchangeRate,
                )}
              </p>
            </div>
          </Card>

          <Card>
            <h2 className="font-display text-xl text-ink">Movimientos</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="font-medium text-ink">Ingresos</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/60">
                  <span>Total ({project._count.incomes}): <span className="font-semibold text-ink">{formatUsd(project._incomeTotals.all)}</span></span>
                  <span>Cobrado: <span className="font-semibold text-emerald-600">{formatUsd(project._incomeTotals.paid)}</span></span>
                  <span>Pendiente: <span className="font-semibold text-amber-600">{formatUsd(project._incomeTotals.pending)}</span></span>
                </div>
                {(project._incomeTotals.allArs as number) > 0 && (
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/50">
                    <span>Total ARS: {formatArs(project._incomeTotals.allArs)}</span>
                    <span>Cobrado ARS: {formatArs(project._incomeTotals.paidArs)}</span>
                    <span>Pendiente ARS: {formatArs(project._incomeTotals.pendingArs)}</span>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-gray-200 p-3">
                <p className="font-medium text-ink">Gastos</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/60">
                  <span>Total ({project._count.expenses}): <span className="font-semibold text-ink">{formatUsd(project._expenseTotals.all)}</span></span>
                  <span>Pagado: <span className="font-semibold text-emerald-600">{formatUsd(project._expenseTotals.paid)}</span></span>
                  <span>Pendiente: <span className="font-semibold text-amber-600">{formatUsd(project._expenseTotals.pending)}</span></span>
                </div>
                {(project._expenseTotals.allArs as number) > 0 && (
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/50">
                    <span>Total ARS: {formatArs(project._expenseTotals.allArs)}</span>
                    <span>Pagado ARS: {formatArs(project._expenseTotals.paidArs)}</span>
                    <span>Pendiente ARS: {formatArs(project._expenseTotals.pendingArs)}</span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          <p className="text-xs text-ink/30">
            Creado: {new Date(project.createdAt).toLocaleDateString("es-AR")} ·
            Actualizado: {new Date(project.updatedAt).toLocaleDateString("es-AR")}
          </p>
        </>
      )}
    </div>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={
        "px-4 py-2 text-sm font-medium -mb-px border-b-2 transition " +
        (active
          ? "border-brand text-ink"
          : "border-transparent text-ink/50 hover:text-ink")
      }
    >
      {children}
    </Link>
  );
}
