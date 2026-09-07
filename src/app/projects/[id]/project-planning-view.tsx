"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalPortal } from "@/components/ui/modal-portal";
import { ConfirmActionModal } from "@/components/ui/confirm-action-modal";
import { ProjectGantt } from "@/components/projects/dhtmlx/project-gantt";
import { ProjectAccessPanel } from "@/components/projects/project-access-panel";
import { ProjectSharedFolderPanel } from "@/components/projects/project-shared-folder-panel";
import { TaskManagerModal } from "@/components/projects/task-manager-modal";
import {
  computeProjectProgress,
  computeElapsedPercent,
  resolveGoLive,
} from "@/lib/project-progress";
import type { ActionResult } from "@/app/projects/planning-actions";
import { savePhase, removePhase } from "@/app/projects/planning-actions";

type PhaseDTO = { id: string; name: string; position: number };
type TaskDTO = {
  id: string;
  phaseId: string | null;
  name: string;
  description: string | null;
  type: "TASK" | "MILESTONE";
  startDate: string;
  endDate: string;
  status: "TODO" | "IN_PROGRESS" | "TO_REVIEW" | "BLOCKED" | "DONE";
  position: number;
  clientVisible: boolean;
};

function goLiveText(g: { hasDate: boolean; daysRemaining: number | null; isToday: boolean }): string {
  if (!g.hasDate) return "—";
  if (g.isToday) return "Hoy";
  if (g.daysRemaining != null && g.daysRemaining < 0) return `Hace ${-g.daysRemaining} días`;
  return `${g.daysRemaining} días`;
}

export function ProjectPlanningView({
  projectId,
  phases: initialPhases,
  tasks: initialTasks,
  projectStartDate,
  projectEndDate,
  projectGoLiveDate,
  shareAccess,
  clientSharedFolderUrl,
  clientSharedFolderLabel,
}: {
  projectId: string;
  phases: PhaseDTO[];
  tasks: TaskDTO[];
  projectStartDate: string | null;
  projectEndDate: string | null;
  projectGoLiveDate: string | null;
  shareAccess: { slug: string; revokedAt: string | null } | null;
  clientSharedFolderUrl: string | null;
  clientSharedFolderLabel: string | null;
}) {
  const router = useRouter();
  const [phases, setPhases] = useState<PhaseDTO[]>(initialPhases);
  const [tasks, setTasks] = useState<TaskDTO[]>(initialTasks);
  const [banner, setBanner] = useState<string | null>(null);

  const [phaseModal, setPhaseModal] = useState<{ open: boolean; editing?: PhaseDTO }>({ open: false });
  const [deletePhaseTarget, setDeletePhaseTarget] = useState<PhaseDTO | null>(null);
  const [taskManagerOpen, setTaskManagerOpen] = useState(false);

  useEffect(() => setPhases(initialPhases), [initialPhases]);
  useEffect(() => setTasks(initialTasks), [initialTasks]);

  const refresh = () => router.refresh();

  const progress = computeProjectProgress(tasks);
  const elapsed = computeElapsedPercent(projectStartDate, projectEndDate);
  const goLive = resolveGoLive(projectGoLiveDate);

  const tasksByPhase = new Map<string, TaskDTO[]>();
  const unphased: TaskDTO[] = [];
  for (const t of tasks) {
    if (t.phaseId) {
      const list = tasksByPhase.get(t.phaseId) ?? [];
      list.push(t);
      tasksByPhase.set(t.phaseId, list);
    } else {
      unphased.push(t);
    }
  }

  const runAction = async (
    action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>,
    build: (fd: FormData) => void,
  ) => {
    setBanner(null);
    const fd = new FormData();
    build(fd);
    const r = await action(null, fd);
    if (!r.success) {
      setBanner(r.message);
      return;
    }
    refresh();
  };

  const empty = phases.length === 0 && tasks.length === 0;

  return (
    <div className="space-y-6">
      {/* Métricas */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Avance completado" value={progress.hasTasks ? `${progress.percent}%` : "Sin tareas"} />
        <Metric label="Tiempo transcurrido" value={elapsed === null ? "—" : `${elapsed}%`} />
        <Metric label="Para Go Live" value={goLiveText(goLive)} />
      </div>

      <Card>
        <h2 className="font-display text-xl text-ink">Acceso del cliente</h2>
        <div className="mt-3">
          <ProjectAccessPanel projectId={projectId} initialAccess={shareAccess} />
        </div>
        <ProjectSharedFolderPanel
          projectId={projectId}
          initialFolder={
            clientSharedFolderUrl
              ? { url: clientSharedFolderUrl, label: clientSharedFolderLabel }
              : null
          }
        />
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl text-ink">Planificación</h2>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setPhaseModal({ open: true })}>Nueva fase</Button>
          <Button onClick={() => setTaskManagerOpen(true)}>Gestionar tareas</Button>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="font-display text-xl text-ink">Cronograma</h2>
        <ProjectGantt phases={phases} tasks={tasks} projectId={projectId} />
      </section>

      {banner && (
        <p className="rounded-lg border border-brick/30 bg-brick/5 px-3 py-2 text-sm text-brick">{banner}</p>
      )}

      {empty && (
        <Card>
          <div className="space-y-4 py-2 text-center">
            <p className="text-sm text-ink/60">Este proyecto todavía no tiene planificación cargada.</p>
            <div className="flex justify-center gap-2">
              <Button variant="secondary" onClick={() => setPhaseModal({ open: true })}>Nueva fase</Button>
              <Button onClick={() => setTaskManagerOpen(true)}>Gestionar tareas</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Fases — resumen read-only, la gestión de tareas es única en Gestionar tareas */}
      {phases.length > 0 && (
        <Card>
          <h3 className="font-display text-lg text-ink">Fases</h3>
          <div className="mt-3 divide-y divide-gray-100">
            {phases.map((phase) => {
              const count = (tasksByPhase.get(phase.id) ?? []).length;
              return (
                <div key={phase.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-medium text-ink">{phase.name}</p>
                    <p className="text-xs text-ink/50">{count} tarea{count !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="secondary" className="text-xs" onClick={() => setPhaseModal({ open: true, editing: phase })}>
                      Editar
                    </Button>
                    <Button variant="secondary" className="text-xs text-brick" onClick={() => setDeletePhaseTarget(phase)}>
                      Eliminar
                    </Button>
                  </div>
                </div>
              );
            })}
            {unphased.length > 0 && (
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-ink">Sin fase</p>
                  <p className="text-xs text-ink/50">{unphased.length} tarea{unphased.length !== 1 ? "s" : ""}</p>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      <PhaseFormModal
        open={phaseModal.open}
        title={phaseModal.editing ? "Editar fase" : "Nueva fase"}
        initial={phaseModal.editing}
        projectId={projectId}
        onClose={() => setPhaseModal({ open: false })}
        onSubmit={(fd) => savePhase(null, fd)}
      />

      <TaskManagerModal
        open={taskManagerOpen}
        onClose={() => setTaskManagerOpen(false)}
        projectId={projectId}
        phases={phases}
        tasks={tasks}
      />

      <ConfirmActionModal
        open={!!deletePhaseTarget}
        title="Eliminar fase"
        description={`¿Eliminar "${deletePhaseTarget?.name}"? Las tareas asociadas quedarán sin fase (no se eliminan).`}
        confirmLabel="Eliminar"
        isPending={false}
        error={null}
        onClose={() => setDeletePhaseTarget(null)}
        onConfirm={() => {
          if (!deletePhaseTarget) return;
          const target = deletePhaseTarget;
          setDeletePhaseTarget(null);
          runAction(removePhase, (fd) => {
            fd.set("id", target.id);
          });
        }}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <div className="space-y-1">
        <div className="font-display text-3xl text-ink">{value}</div>
        <div className="text-xs uppercase tracking-wider text-ink/50">{label}</div>
      </div>
    </Card>
  );
}

function PhaseFormModal({
  open,
  title,
  initial,
  projectId,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initial?: PhaseDTO;
  projectId: string;
  onClose: () => void;
  onSubmit: (fd: FormData) => Promise<ActionResult>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setError(null);
  }, [open, initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("projectId", projectId);
      if (initial) fd.set("id", initial.id);
      fd.set("name", name);
      const r = await onSubmit(fd);
      if (!r.success) {
        setError(r.message);
        return;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[90] overflow-y-auto px-4 py-6">
        <button aria-label="Cerrar" className="fixed inset-0 bg-ink/45 backdrop-blur-sm" onClick={onClose} type="button" />
        <div className="relative flex min-h-full items-start justify-center sm:items-center">
          <div className="w-full max-w-lg rounded-[1.5rem] bg-white p-6 shadow-[0_24px_80px_rgba(16,21,34,0.18)]">
            <h2 className="font-display text-2xl text-ink">{title}</h2>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <Input placeholder="Nombre de la fase" value={name} onChange={(e) => setName(e.target.value)} required />
              {error && <p className="text-sm text-brick">{error}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
