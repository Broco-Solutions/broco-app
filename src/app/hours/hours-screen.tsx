"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { saveTimeEntry, updateEntry, voidEntry } from "./actions";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, DataTableActions } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { TimeDurationFields, TimeEntryDateField } from "@/components/hours/time-entry-fields";
import type { CurrentUser } from "@/lib/auth";
import { formatTimeMinutes, splitTimeMinutes } from "@/lib/time-duration";
import { getTimeEntryFeedback } from "@/lib/time-entry-feedback";

type Project = { id: string; name: string; client: { id: string; name: string } };
type User = { id: string; name: string };
type Entry = { id: string; userId: string; projectId: string; workDate: string; minutes: number; description: string; referenceUrl?: string | null; status: string; updatedAt: string; user: { name: string }; project: { name: string; client: { name: string } } };

function EntryActions({ entry, onEdit }: { entry: Entry; onEdit: () => void }) {
  if (entry.status !== "ACTIVE") return <span className="text-xs text-gray-500">Anulado</span>;
  return <DataTableActions className="justify-start">
    <button type="button" className="text-xs font-medium text-brand" onClick={onEdit}>Corregir</button>
    <form action={voidEntry} className="inline-flex max-w-full gap-1">
      <input type="hidden" name="id" value={entry.id} />
      <input name="reason" required placeholder="Motivo" aria-label={`Motivo para anular ${entry.description}`} className="h-8 w-24 max-w-full rounded border px-2 text-xs" />
      <button className="text-xs font-medium text-red-700">Anular</button>
    </form>
  </DataTableActions>;
}

export function HoursScreen({ actor, users, projects, entries, defaultFrom, defaultTo, initialClientId = "", initialProjectId = "", initialWorkDate, saved = false }: { actor: CurrentUser; users: User[]; projects: Project[]; entries: Entry[]; defaultFrom: string; defaultTo: string; initialClientId?: string; initialProjectId?: string; initialWorkDate?: string; saved?: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [clientId, setClientId] = useState(initialClientId);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [pending, start] = useTransition();
  const [showSaved, setShowSaved] = useState(saved);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHours, setEditHours] = useState("");
  const [editMinutes, setEditMinutes] = useState("");
  const [state, formAction] = useFormState(saveTimeEntry, null);
  const [updateState, updateAction] = useFormState(updateEntry, null);
  const operationId = useState(() => (typeof crypto !== "undefined" ? crypto.randomUUID() : ""))[0];
  useEffect(() => { setShowSaved(saved); }, [saved]);
  const feedback = getTimeEntryFeedback({
    saved: showSaved,
    actionSucceeded: state?.success === true,
    actionFailed: state?.success === false,
    pending,
  });
  const clients = useMemo(() => [...new Map(projects.map((project) => [project.client.id, { id: project.client.id, name: project.client.name }])).values()], [projects]);
  const filteredProjects = projects.filter((project) => !clientId || project.client.id === clientId);
  const beginEdit = (entry: Entry) => {
    const parts = splitTimeMinutes(entry.minutes);
    setEditHours(String(parts.hours));
    setEditMinutes(String(parts.minutes));
    setEditingId(entry.id);
  };
  const renderEditForm = (entry: Entry) => <form action={updateAction} className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-6">
    <input type="hidden" name="id" value={entry.id} />
    <input type="hidden" name="projectId" value={entry.projectId} />
    <input type="hidden" name="expectedUpdatedAt" value={entry.updatedAt} />
    <Input name="workDate" type="date" defaultValue={String(entry.workDate).slice(0, 10)} max={defaultTo} />
    <TimeDurationFields hours={editHours} minutes={editMinutes} onHoursChange={setEditHours} onMinutesChange={setEditMinutes} className="sm:col-span-2" />
    <Input name="description" defaultValue={entry.description} required />
    <Input name="reason" placeholder={actor.role === "ADMIN" && entry.userId !== actor.id ? "Motivo obligatorio" : "Motivo (opcional)"} required={actor.role === "ADMIN" && entry.userId !== actor.id} />
    <div className="flex gap-2 sm:col-span-2 lg:col-span-1"><Button type="submit" disabled={pending}>Guardar</Button><Button type="button" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button></div>
    {updateState && !updateState.success ? <p role="alert" className="text-sm text-red-700 sm:col-span-2 lg:col-span-6">{updateState.message}</p> : null}
  </form>;
  return <div className="space-y-5">
    <Card><form ref={formRef} onSubmit={(event) => { event.preventDefault(); setShowSaved(false); start(() => formAction(new FormData(event.currentTarget))); }} className="space-y-4">
      <input type="hidden" name="operationId" value={operationId} />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {actor.role === "ADMIN" ? <div><label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Usuario</label><select name="userId" defaultValue={actor.id} className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm">{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></div> : <input type="hidden" name="userId" value={actor.id} />}
        <TimeEntryDateField defaultValue={initialWorkDate || defaultTo} max={defaultTo} />
        <div><label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Cliente</label><SearchableSelect value={clientId} onChange={(value) => { setClientId(value); setProjectId(""); }} options={clients} placeholder="Seleccionar cliente" className="mt-1" /><input type="hidden" name="clientId" value={clientId} /></div>
        <div><label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Proyecto</label><SearchableSelect value={projectId} onChange={setProjectId} options={filteredProjects} placeholder="Seleccionar proyecto" disabled={!clientId} className="mt-1" /><input type="hidden" name="projectId" value={projectId} /></div>
      </div>
      <TimeDurationFields hours={hours} minutes={minutes} onHoursChange={setHours} onMinutesChange={setMinutes} />
      <div><label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Descripción</label><Textarea name="description" required placeholder="¿Qué trabajo se realizó?" className="mt-1" /></div>
      <div><label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Enlace de referencia (opcional)</label><Input name="referenceUrl" type="url" placeholder="https://…" /></div>
      {feedback === "error" && state && !state.success ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.message}</p> : null}
      {feedback === "success" ? <p role="status" aria-live="polite" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">Registro guardado correctamente.</p> : null}
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={pending || !projectId}>{pending ? "Guardando…" : "Guardar"}</Button><Button type="submit" name="saveMode" value="another" disabled={pending || !projectId} variant="secondary">Guardar y cargar otra</Button></div>
    </form></Card>
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Registros filtrados</h2><span className="text-sm font-semibold tabular-nums">{formatTimeMinutes(entries.filter((entry) => entry.status === "ACTIVE").reduce((sum, entry) => sum + entry.minutes, 0))}</span></div>
      {entries.length === 0 ? <EmptyState title="Sin registros en este período" description="Cuando guardes una carga, va a aparecer acá con su cliente, proyecto y duración." /> : <>
        <div className="hidden lg:block"><DataTable tableClassName="table-fixed" colGroup={<colgroup><col style={{ width: "10%" }} /><col style={{ width: "13%" }} /><col style={{ width: "15%" }} /><col style={{ width: "17%" }} /><col style={{ width: "20%" }} /><col style={{ width: "10%" }} /><col style={{ width: "15%" }} /></colgroup>} headers={["Fecha", "Usuario", "Cliente", "Proyecto", "Descripción", "Duración", "Acciones"]}>{entries.map((entry) => editingId === entry.id ? <tr key={entry.id}><td colSpan={7} className="px-3 py-2.5">{renderEditForm(entry)}</td></tr> : <tr key={entry.id} className={entry.status === "VOID" ? "text-gray-400 line-through" : ""}><td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{String(entry.workDate).slice(0, 10)}</td><td className="truncate px-3 py-2.5" title={entry.user.name}>{entry.user.name}</td><td className="truncate px-3 py-2.5" title={entry.project.client.name}>{entry.project.client.name}</td><td className="truncate px-3 py-2.5" title={entry.project.name}>{entry.project.name}</td><td className="truncate px-3 py-2.5" title={entry.description}>{entry.description}</td><td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{formatTimeMinutes(entry.minutes)}</td><td className="px-3 py-2.5"><EntryActions entry={entry} onEdit={() => beginEdit(entry)} /></td></tr>)}</DataTable></div>
        <div className="space-y-2 lg:hidden">{entries.map((entry) => editingId === entry.id ? <div key={entry.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">{renderEditForm(entry)}</div> : <article key={entry.id} className={`rounded-xl border border-gray-200 bg-white p-3 ${entry.status === "VOID" ? "text-gray-400" : ""}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs tabular-nums text-gray-500">{String(entry.workDate).slice(0, 10)} · {entry.user.name}</p><h3 className="mt-1 break-words text-sm font-semibold">{entry.description}</h3></div><span className="shrink-0 text-sm font-semibold tabular-nums">{formatTimeMinutes(entry.minutes)}</span></div><p className="mt-2 break-words text-xs text-gray-500">{entry.project.client.name} · {entry.project.name}</p><div className="mt-3"><EntryActions entry={entry} onEdit={() => beginEdit(entry)} /></div></article>)}</div>
      </>}
    </Card>
  </div>;
}
