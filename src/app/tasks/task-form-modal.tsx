"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EditEntityModal } from "@/components/ui/edit-entity-modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createOperationalTaskAction, updateOperationalTaskAction } from "./actions";
import type { OperationalTaskDTO, TaskAssigneeOption, TaskProjectOption } from "./types";

export function TaskFormModal({
  open,
  task,
  isAdmin,
  actorId,
  projects,
  assignees,
  onClose,
}: {
  open: boolean;
  task: OperationalTaskDTO | null;
  isAdmin: boolean;
  actorId: string;
  projects: TaskProjectOption[];
  assignees: TaskAssigneeOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState(actorId);
  const [projectId, setProjectId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setAssigneeId(task?.assigneeId ?? actorId);
    setProjectId(task?.projectId ?? "");
    setDueDate(task?.dueDate?.slice(0, 10) ?? "");
    setError(null);
  }, [actorId, open, task]);

  const selectableProjects = projects.filter((project) => project.isActive || project.id === task?.projectId);
  const projectOptions = selectableProjects.map((project) => ({
    id: project.id,
    name: `${project.client.name} · ${project.name}${project.isActive ? "" : " (inactivo)"}`,
  }));

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("title", title);
      formData.set("description", description);
      formData.set("dueDate", dueDate);
      if (isAdmin && (!task || assigneeId !== task.assigneeId)) formData.set("assigneeId", assigneeId);
      if (!task || projectId !== (task.projectId ?? "")) formData.set("projectId", projectId);
      if (task) {
        formData.set("id", task.id);
        formData.set("expectedUpdatedAt", task.updatedAt);
      } else {
        formData.set("projectId", projectId);
      }
      const result = task
        ? await updateOperationalTaskAction(null, formData)
        : await createOperationalTaskAction(null, formData);
      if (!result.success) throw new Error(result.message);
      onClose();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la tarea.");
    } finally {
      setPending(false);
    }
  };

  return (
    <EditEntityModal
      open={open}
      title={task ? "Editar tarea" : "Nueva tarea"}
      description={task ? "Actualizá el trabajo y su contexto operativo." : "Registrá sólo lo necesario para poder avanzar."}
      submitLabel={task ? "Guardar cambios" : "Crear tarea"}
      widthClassName="max-w-2xl"
      isPending={pending}
      disabled={!title.trim() || (isAdmin && !assigneeId)}
      error={error}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Título *</span>
          <Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={300} className="mt-1" />
        </label>
        {isAdmin ? (
          <label>
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Responsable *</span>
            <SearchableSelect
              value={assigneeId}
              onChange={setAssigneeId}
              options={assignees.map((user) => ({ id: user.id, name: user.name }))}
              placeholder="Seleccionar responsable"
              className="mt-1"
            />
          </label>
        ) : null}
        <label className={isAdmin ? "" : "sm:col-span-1"}>
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Vencimiento</span>
          <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-1" />
        </label>
        <label className="sm:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Proyecto</span>
          <div className="mt-1 flex items-center gap-2">
            <SearchableSelect value={projectId} onChange={setProjectId} options={projectOptions} placeholder="Sin proyecto" className="min-w-0 flex-1" />
            {projectId ? <button type="button" className="text-xs font-medium text-brand" onClick={() => setProjectId("")}>Quitar</button> : null}
          </div>
          <p className="mt-1 text-xs text-gray-500">Los proyectos se muestran como Cliente · Proyecto.</p>
        </label>
        <label className="sm:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Descripción</span>
          <Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={10000} rows={7} className="mt-1" />
        </label>
      </div>
    </EditEntityModal>
  );
}
