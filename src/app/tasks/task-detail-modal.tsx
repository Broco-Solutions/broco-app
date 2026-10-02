"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Clock3, ExternalLink, Pencil, X } from "lucide-react";
import { ModalPortal } from "@/components/ui/modal-portal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { OperationalTaskStatusBadge, OPERATIONAL_STATUS_LABELS } from "@/components/tasks/operational-task-status";
import { formatDate } from "@/lib/dates";
import { formatTimeMinutes } from "@/lib/time-duration";
import { changeOperationalTaskStatusAction } from "./actions";
import type { OperationalTaskDTO, OperationalTaskStatusDTO } from "./types";

const statuses = ["PENDING", "IN_PROGRESS", "BLOCKED", "DONE"] as const;

export function TaskDetailModal({
  task,
  isAdmin,
  today,
  onClose,
  onEdit,
  onRegisterTime,
  onStatusChanged,
}: {
  task: OperationalTaskDTO | null;
  isAdmin: boolean;
  today: string;
  onClose: () => void;
  onEdit: () => void;
  onRegisterTime: () => void;
  onStatusChanged: (task: Pick<OperationalTaskDTO, "id" | "status" | "updatedAt" | "completedAt" | "blockedReason">) => void;
}) {
  const [pendingStatus, setPendingStatus] = useState<OperationalTaskStatusDTO | null>(null);
  const [blockedReason, setBlockedReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completionNotice, setCompletionNotice] = useState(false);
  const taskId = task?.id ?? null;
  const initialBlockedReason = task?.blockedReason ?? "";

  useEffect(() => {
    if (!taskId) return;
    setPendingStatus(null);
    setBlockedReason(initialBlockedReason);
    setError(null);
    setCompletionNotice(false);
  }, [initialBlockedReason, taskId]);

  useEffect(() => {
    if (!taskId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, taskId]);

  if (!task) return null;
  const overdue = Boolean(task.dueDate && task.dueDate.slice(0, 10) < today && task.status !== "DONE");
  const changeStatus = async (status: OperationalTaskStatusDTO) => {
    if (status === "BLOCKED" && pendingStatus !== "BLOCKED") {
      setPendingStatus("BLOCKED");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("id", task.id);
      formData.set("status", status);
      formData.set("expectedUpdatedAt", task.updatedAt);
      if (status === "BLOCKED") formData.set("blockedReason", blockedReason);
      const result = await changeOperationalTaskStatusAction(null, formData);
      if (!result.success) throw new Error(result.message);
      onStatusChanged({
        id: task.id,
        status: result.status ?? status,
        updatedAt: result.updatedAt,
        completedAt: result.completedAt ?? null,
        blockedReason: result.blockedReason ?? task.blockedReason,
      });
      setPendingStatus(null);
      if (result.justCompleted) setCompletionNotice(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cambiar el estado.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[90] overflow-y-auto px-3 py-4 sm:px-6 sm:py-8">
        <button type="button" aria-label="Cerrar detalle" className="fixed inset-0 bg-ink/45 backdrop-blur-sm" onClick={onClose} />
        <div className="relative mx-auto flex min-h-full max-w-4xl items-start justify-center sm:items-center">
          <div className="relative w-full" role="dialog" aria-modal="true" aria-labelledby="task-detail-title">
          <Card className="w-full overflow-hidden border border-black/10 bg-white p-0 shadow-[0_24px_80px_rgba(16,21,34,0.18)]">
            <div className="flex max-h-[calc(100vh-2rem)] flex-col sm:max-h-[calc(100vh-4rem)]">
              <header className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <OperationalTaskStatusBadge status={task.status} />
                    {overdue ? <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Vencida</span> : null}
                  </div>
                  <h2 id="task-detail-title" className="mt-3 break-words font-display text-2xl text-ink sm:text-3xl">{task.title}</h2>
                </div>
                <button type="button" aria-label="Cerrar detalle" className="rounded-full border border-gray-200 p-2 text-gray-600 hover:bg-gray-50" onClick={onClose}><X className="h-4 w-4" /></button>
              </header>

              <div className="flex-1 overflow-y-auto p-5 sm:p-6">
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr),280px]">
                  <div className="space-y-6">
                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Descripción</h3>
                      <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">{task.description || "Sin descripción."}</div>
                    </section>
                    {task.referenceUrl ? (
                      <section>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Enlace de referencia</h3>
                        <a href={task.referenceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1.5 break-all text-sm font-medium text-brand hover:underline">
                          <ExternalLink className="h-4 w-4 shrink-0" />
                          {task.referenceUrl}
                        </a>
                      </section>
                    ) : null}
                    {task.blockedReason ? (
                      <section className="rounded-xl border border-red-100 bg-red-50/70 p-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-red-700">Motivo de bloqueo</h3>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-red-900">{task.blockedReason}</p>
                      </section>
                    ) : null}
                    {pendingStatus === "BLOCKED" ? (
                      <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                        <label className="text-sm font-semibold text-ink">¿Qué necesitás para continuar?</label>
                        <Textarea value={blockedReason} onChange={(event) => setBlockedReason(event.target.value)} rows={4} className="mt-2 bg-white" autoFocus />
                        <div className="mt-3 flex justify-end gap-2">
                          <Button type="button" variant="ghost" onClick={() => setPendingStatus(null)}>Cancelar</Button>
                          <Button type="button" disabled={saving || !blockedReason.trim()} onClick={() => void changeStatus("BLOCKED")}>Guardar bloqueo</Button>
                        </div>
                      </section>
                    ) : null}
                    {completionNotice ? (
                      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                        <p className="font-semibold text-emerald-900">Tarea completada.</p>
                        <p className="mt-1 text-sm text-emerald-800">Podés registrar el tiempo trabajado ahora o hacerlo más tarde.</p>
                        {task.timeMinutes > 0 ? <p className="mt-2 text-sm text-emerald-900">Tiempo registrado: <strong>{formatTimeMinutes(task.timeMinutes)}</strong>. ¿Querés agregar otro registro?</p> : null}
                        {task.project ? <Button type="button" className="mt-3" onClick={onRegisterTime}>Registrar tiempo</Button> : <p className="mt-3 text-xs text-emerald-800">Esta tarea no tiene proyecto, por eso no admite carga de tiempo.</p>}
                        <Button type="button" variant="ghost" className="ml-2 mt-3 text-xs text-emerald-900" onClick={() => setCompletionNotice(false)}>Ahora no</Button>
                      </section>
                    ) : null}
                    <section>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Registros de tiempo vinculados</h3>
                        {task.timeEntries.length > 0 ? <Link href={`/hours?from=${task.createdAt.slice(0, 10)}&to=${today}&operationalTaskId=${task.id}${isAdmin ? `&userId=${task.assigneeId}` : ""}`} className="text-xs font-medium text-brand hover:underline">Administrar en Tiempos →</Link> : null}
                      </div>
                      {task.timeEntries.length === 0 ? <p className="mt-2 text-sm text-gray-500">Todavía no hay tiempo registrado.</p> : (
                        <div className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-100">
                          {task.timeEntries.map((entry) => <div key={entry.id} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm ${entry.status === "VOID" ? "text-gray-400 line-through" : ""}`}><div><span className="font-medium">{entry.user.name}</span><span className="ml-2 text-xs text-gray-500">{formatDate(entry.workDate)}</span><p className="mt-0.5 max-w-xl break-words text-xs text-gray-500">{entry.description}</p></div><span className="font-semibold tabular-nums">{formatTimeMinutes(entry.minutes)}</span></div>)}
                        </div>
                      )}
                    </section>
                  </div>

                  <aside className="space-y-5 rounded-xl border border-gray-100 bg-gray-50/70 p-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Responsable</p>
                      <p className="mt-1 text-sm font-medium">{task.assignee.name}{!task.assignee.isActive ? " · inactivo" : ""}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Cliente · Proyecto</p>
                      <p className="mt-1 text-sm">{task.project ? `${task.project.client.name} · ${task.project.name}` : "Tarea general"}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Vence</p><p className={overdue ? "mt-1 text-sm font-semibold text-red-700" : "mt-1 text-sm"}>{formatDate(task.dueDate)}</p></div>
                      <div><p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Actualizada</p><p className="mt-1 text-sm">{formatDate(task.updatedAt)}</p></div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Tiempo registrado</p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-gray-700"><Clock3 className="h-4 w-4" /> {task.timeMinutes > 0 ? formatTimeMinutes(task.timeMinutes) : "Sin registros"}</p>
                      {!completionNotice ? <Button type="button" variant="secondary" className="mt-2 w-full text-xs" disabled={!task.project} onClick={onRegisterTime}>Registrar tiempo</Button> : null}
                      {!task.project && !completionNotice ? <p className="mt-1 text-xs text-amber-700">Requiere un proyecto.</p> : null}
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Cambiar estado</p>
                      <div className="mt-2 grid gap-2">
                        {statuses.filter((status) => status !== task.status).map((status) => (
                          <Button key={status} type="button" variant="secondary" disabled={saving} className="justify-start text-xs" onClick={() => void changeStatus(status)}>
                            {status === "DONE" ? "Completar tarea" : task.status === "DONE" && status === "PENDING" ? "Reabrir como pendiente" : OPERATIONAL_STATUS_LABELS[status]}
                          </Button>
                        ))}
                      </div>
                    </div>
                    {error ? <p role="alert" className="text-sm text-brick">{error}</p> : null}
                  </aside>
                </div>
              </div>

              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-white px-5 py-4 sm:px-6">
                <p className="flex items-center gap-1.5 text-xs text-gray-500"><CalendarDays className="h-4 w-4" /> Creada por {task.creator.name}</p>
                <Button type="button" variant="secondary" onClick={onEdit}><Pencil className="mr-1.5 h-4 w-4" /> Editar{isAdmin ? " / reasignar" : ""}</Button>
              </footer>
            </div>
          </Card>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
