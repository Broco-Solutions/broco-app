"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
type Option = { id: string; name: string };
type Project = Option & { client: Option };
export function ReportsFilters({ filters, isAdmin, clients, projects, users }: { filters: { from: string; to: string; clientId?: string; projectId?: string; userId?: string }; isAdmin: boolean; clients: Option[]; projects: Project[]; users: Option[] }) {
  const router = useRouter(); const [clientId, setClientId] = useState(filters.clientId ?? ""); const [projectId, setProjectId] = useState(filters.projectId ?? "");
  return <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const q = new URLSearchParams(); q.set("from", String(fd.get("from") ?? "")); q.set("to", String(fd.get("to") ?? "")); if (clientId) q.set("clientId", clientId); if (projectId) q.set("projectId", projectId); if (isAdmin && fd.get("userId")) q.set("userId", String(fd.get("userId"))); router.push(`/hours/reports?${q}`); }}>
    <label className="text-xs text-gray-500">Desde<Input name="from" type="date" defaultValue={filters.from} /></label><label className="text-xs text-gray-500">Hasta<Input name="to" type="date" defaultValue={filters.to} /></label>
    <div className="w-52"><span className="text-xs text-gray-500">Cliente</span><SearchableSelect value={clientId} onChange={(v) => { setClientId(v); setProjectId(""); }} options={clients} placeholder="Todos" /></div>
    <div className="w-52"><span className="text-xs text-gray-500">Proyecto</span><SearchableSelect value={projectId} onChange={setProjectId} options={projects.filter((p) => !clientId || p.client.id === clientId)} placeholder="Todos" /></div>
    {isAdmin ? <select name="userId" defaultValue={filters.userId ?? ""} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm"><option value="">Todo el equipo</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select> : null}<Button type="submit">Aplicar</Button><a href={`/api/hours/export?${new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) as Record<string, string>)}`} className="inline-flex h-10 items-center rounded-lg border border-gray-200 px-3 text-sm">Exportar CSV</a>
  </form>;
}
