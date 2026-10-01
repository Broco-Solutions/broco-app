"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3 } from "lucide-react";
import { EditEntityModal } from "@/components/ui/edit-entity-modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { registerOperationalTaskTimeAction } from "./actions";
import type { OperationalTaskDTO } from "./types";

export function TaskTimeModal({
  task,
  today,
  onClose,
}: {
  task: OperationalTaskDTO | null;
  today: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [workDate, setWorkDate] = useState(today);
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [detail, setDetail] = useState("");
  const [operationId, setOperationId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taskId = task?.id ?? null;

  useEffect(() => {
    if (!taskId) return;
    setWorkDate(today);
    setHours("");
    setMinutes("");
    setDetail("");
    setError(null);
    setOperationId(crypto.randomUUID());
  }, [taskId, today]);

  if (!task) return null;
  const totalMinutes = (Number(hours) || 0) * 60 + (Number(minutes) || 0);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("taskId", task.id);
      formData.set("workDate", workDate);
      formData.set("hours", hours || "0");
      formData.set("minutes", minutes || "0");
      formData.set("additionalDetail", detail);
      formData.set("operationId", operationId);
      const result = await registerOperationalTaskTimeAction(null, formData);
      if (!result.success) throw new Error(result.message);
      onClose();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar el tiempo.");
    } finally {
      setPending(false);
    }
  };

  return (
    <EditEntityModal
      open
      title="Registrar tiempo"
      description="La carga se guarda en el módulo Tiempos y conserva sus reglas de auditoría."
      submitLabel="Registrar tiempo"
      widthClassName="max-w-xl"
      isPending={pending}
      disabled={!task.project || totalMinutes <= 0 || totalMinutes > 1440}
      error={error}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="rounded-xl border border-cobalt/10 bg-cobalt/[0.035] p-4">
        <div className="flex items-start gap-3">
          <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-cobalt" />
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold text-ink">{task.title}</p>
            <p className="mt-1 text-xs text-gray-600">{task.assignee.name}</p>
            <p className="mt-0.5 truncate text-xs text-gray-600">{task.project ? `${task.project.client.name} · ${task.project.name}` : "Sin proyecto"}</p>
          </div>
        </div>
      </div>
      {!task.project ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Asigná un proyecto a la tarea antes de registrar tiempo.</p> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="sm:col-span-3"><span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Fecha</span><Input type="date" value={workDate} max={today} onChange={(event) => setWorkDate(event.target.value)} className="mt-1" required /></label>
        <label><span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Horas</span><Input type="number" min="0" max="24" step="1" inputMode="numeric" value={hours} onChange={(event) => setHours(event.target.value)} placeholder="0" className="mt-1" /></label>
        <label><span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Minutos</span><Input type="number" min="0" max="59" step="1" inputMode="numeric" value={minutes} onChange={(event) => setMinutes(event.target.value)} placeholder="0" className="mt-1" /></label>
        <div className="flex items-end pb-2 text-sm font-semibold tabular-nums text-ink">Total: {Math.floor(totalMinutes / 60)} h {totalMinutes % 60} min</div>
        <label className="sm:col-span-3"><span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Detalle adicional</span><Textarea value={detail} onChange={(event) => setDetail(event.target.value)} rows={3} maxLength={1600} placeholder="Opcional: qué parte se trabajó" className="mt-1" /><p className="mt-1 text-xs text-gray-500">La descripción del registro será “{task.title}{detail.trim() ? ` — ${detail.trim()}` : ""}”.</p></label>
      </div>
    </EditEntityModal>
  );
}
