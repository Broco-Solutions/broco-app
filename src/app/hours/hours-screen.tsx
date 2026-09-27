"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { saveTimeEntry, updateEntry, voidEntry } from "./actions";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DataTable } from "@/components/ui/data-table";
import type { CurrentUser } from "@/lib/auth";

type Project = { id: string; name: string; client: { id: string; name: string } };
type User = { id: string; name: string };
type Entry = { id: string; userId: string; projectId: string; workDate: string; minutes: number; description: string; referenceUrl?: string | null; status: string; user: { name: string }; project: { name: string; client: { name: string } } };
function formatMinutes(minutes: number) { const h = Math.floor(minutes / 60); const m = minutes % 60; return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`; }

export function HoursScreen({ actor, users, projects, entries, defaultFrom, defaultTo }: { actor: CurrentUser; users: User[]; projects: Project[]; entries: Entry[]; defaultFrom: string; defaultTo: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [clientId, setClientId] = useState(""); const [projectId, setProjectId] = useState(""); const [unit, setUnit] = useState("MINUTES"); const [duration, setDuration] = useState(""); const [pending, start] = useTransition(); const [editingId, setEditingId] = useState<string | null>(null);
  const [state, formAction] = useFormState(saveTimeEntry, null); const [updateState, updateAction] = useFormState(updateEntry, null);
  const [operationId, setOperationId] = useState(() => (typeof crypto !== "undefined" ? crypto.randomUUID() : ""));
  const clients = useMemo(() => [...new Map(projects.map((p) => [p.client.id, { id: p.client.id, name: p.client.name }])).values()], [projects]);
  const filteredProjects = projects.filter((p) => !clientId || p.client.id === clientId);
  const equivalent = Number(duration.replace(",", ".")) * (unit === "HOURS" ? 60 : 1);
  const submit = (form: HTMLFormElement) => start(() => formAction(new FormData(form)));
  useEffect(() => { if (!state?.success) return; setOperationId(typeof crypto !== "undefined" ? crypto.randomUUID() : ""); if (state.reset) { setDuration(""); const description = formRef.current?.elements.namedItem("description") as HTMLTextAreaElement | null; const reference = formRef.current?.elements.namedItem("referenceUrl") as HTMLInputElement | null; if (description) description.value = ""; if (reference) reference.value = ""; } router.refresh(); }, [router, state]);
  return <div className="space-y-5">
    <Card><form ref={formRef} onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }} className="space-y-4">
      <input type="hidden" name="operationId" value={operationId} />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {actor.role === "ADMIN" ? <div><label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Usuario</label><select name="userId" defaultValue={actor.id} className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm">{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></div> : <input type="hidden" name="userId" value={actor.id} />}
        <div><label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Fecha</label><Input name="workDate" type="date" defaultValue={defaultTo} max={defaultTo} className="mt-1" /></div>
        <div><label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Cliente</label><SearchableSelect value={clientId} onChange={(v) => { setClientId(v); setProjectId(""); }} options={clients} placeholder="Seleccionar cliente" className="mt-1" /><input type="hidden" name="clientId" value={clientId} /></div>
        <div><label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Proyecto</label><SearchableSelect value={projectId} onChange={setProjectId} options={filteredProjects} placeholder="Seleccionar proyecto" disabled={!clientId} className="mt-1" /><input type="hidden" name="projectId" value={projectId} /></div>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr,160px]"><div><label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Duración</label><Input name="duration" inputMode="decimal" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder={unit === "HOURS" ? "1,5" : "90"} className="mt-1" /><p className="mt-1 text-xs text-gray-500">Equivalencia: {Number.isFinite(equivalent) && equivalent > 0 ? formatMinutes(Math.round(equivalent)) : "—"}</p></div><div><label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Unidad</label><select name="unit" value={unit} onChange={(e) => setUnit(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"><option value="MINUTES">Minutos</option><option value="HOURS">Horas</option></select></div></div>
      <div><label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Descripción</label><Textarea name="description" required placeholder="¿Qué trabajo se realizó?" className="mt-1" /></div><div><label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Enlace de referencia (opcional)</label><Input name="referenceUrl" type="url" placeholder="https://…" className="mt-1" /></div>
      {state && !state.success ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.message}</p> : null}<div className="flex flex-wrap gap-2"><Button type="submit" disabled={pending || !projectId}>{pending ? "Guardando…" : "Guardar"}</Button><Button type="submit" name="saveMode" value="another" disabled={pending || !projectId} variant="secondary">Guardar y cargar otra</Button></div>
    </form></Card>
    <Card><div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Esta semana</h2><span className="text-sm font-semibold">{formatMinutes(entries.filter((e) => e.status === "ACTIVE").reduce((s, e) => s + e.minutes, 0))}</span></div><DataTable headers={["Fecha", "Usuario", "Cliente", "Proyecto", "Descripción", "Duración", "Acciones"]}>{entries.map((entry) => editingId === entry.id ? <tr key={entry.id}><td colSpan={7} className="px-4 py-3"><form action={updateAction} className="grid gap-2 md:grid-cols-6"><input type="hidden" name="id" value={entry.id} /><input type="hidden" name="projectId" value={entry.projectId} /><Input name="workDate" type="date" defaultValue={String(entry.workDate).slice(0, 10)} max={defaultTo} /><Input name="duration" type="number" min="1" defaultValue={entry.minutes} /><input type="hidden" name="unit" value="MINUTES" /><Input name="description" defaultValue={entry.description} required /><Input name="reason" placeholder={actor.role === "ADMIN" && entry.userId !== actor.id ? "Motivo obligatorio" : "Motivo (opcional)"} required={actor.role === "ADMIN" && entry.userId !== actor.id} /><div className="flex gap-2"><Button type="submit" disabled={pending}>Guardar</Button><Button type="button" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button></div></form>{updateState && !updateState.success ? <p role="alert" className="mt-2 text-sm text-red-700">{updateState.message}</p> : null}</td></tr> : <tr key={entry.id} className={entry.status === "VOID" ? "text-gray-400 line-through" : ""}><td className="px-4 py-3">{String(entry.workDate).slice(0, 10)}</td><td className="px-4 py-3">{entry.user.name}</td><td className="px-4 py-3">{entry.project.client.name}</td><td className="px-4 py-3">{entry.project.name}</td><td className="max-w-xs px-4 py-3">{entry.description}</td><td className="px-4 py-3 whitespace-nowrap">{formatMinutes(entry.minutes)}</td><td className="px-4 py-3">{entry.status === "ACTIVE" ? <div className="space-y-1"><button type="button" className="mr-2 text-xs font-medium text-brand" onClick={() => setEditingId(entry.id)}>Corregir</button><form action={voidEntry} className="inline-flex gap-1"><input type="hidden" name="id" value={entry.id} /><input name="reason" required placeholder="Motivo" className="h-8 w-24 rounded border px-2 text-xs" /><button className="text-xs font-medium text-red-700">Anular</button></form></div> : "Anulado"}</td></tr>)}</DataTable></Card>
    {state?.success || updateState?.success ? <p className="text-sm text-emerald-700">Guardado correctamente.</p> : null}
  </div>;
}
