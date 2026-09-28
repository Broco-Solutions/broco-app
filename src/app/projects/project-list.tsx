"use client";

import { useEffect, useState } from "react";
import { formatUsd, formatDate } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { ConfirmActionModal } from "@/components/ui/confirm-action-modal";
import { ProjectFormModal } from "./project-form-modal";
import { saveProject, removeProject, toggleProjectActive } from "./actions";

type Project = {
  id: string;
  name: string;
  isActive: boolean;
  startDate: string | Date | null;
  endDate: string | Date | null;
  goLiveDate: string | Date | null;
  oneTimeCurrency: string | null;
  oneTimeAmountUsd: { toString(): string } | string | number | null;
  monthlyRecurringCurrency: string | null;
  monthlyRecurringAmountUsd: { toString(): string } | string | number | null;
  client: { id: string; name: string };
  _count: { incomes: number; expenses: number };
};

function fmtDate(d: string | Date | null) {
  if (!d) return "—";
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return d.slice(0, 10);
}

function fmtAmount(currency: string | null, usd: { toString(): string } | string | number | null) {
  if (!currency || usd == null) return "—";
  const n = typeof usd === "object" && "toString" in usd ? Number(usd.toString()) : Number(usd);
  if (currency === "USD") return formatUsd(n);
  return formatUsd(n);
}

function toISODate(d: string | Date | null): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return d.slice(0, 10);
}

export function ProjectList({ initialProjects, clients }: { initialProjects: Project[]; clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("active");
  const [showForm, setShowForm] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [delError, setDelError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => setProjects(initialProjects), [initialProjects]);

  const handleSave = async (data: Record<string, unknown>) => {
    const fd = new FormData();
    if (editProject) fd.set("id", editProject.id);
    fd.set("clientId", data.clientId as string);
    fd.set("name", data.name as string);
    fd.set("isActive", data.isActive ? "true" : "false");
    if (data.startDate) fd.set("startDate", data.startDate as string);
    if (data.endDate) fd.set("endDate", data.endDate as string);
    if (data.goLiveDate) fd.set("goLiveDate", data.goLiveDate as string);
    if (data.notes) fd.set("notes", data.notes as string);
    if (data.oneTimeOriginalAmount != null) {
      fd.set("oneTimeOriginalAmount", String(data.oneTimeOriginalAmount));
      fd.set("oneTimeCurrency", (data.oneTimeCurrency as string) || "USD");
      if (data.oneTimeExchangeRate != null) fd.set("oneTimeExchangeRate", String(data.oneTimeExchangeRate));
    }
    if (data.monthlyRecurringOriginalAmount != null) {
      fd.set("monthlyRecurringOriginalAmount", String(data.monthlyRecurringOriginalAmount));
      fd.set("monthlyRecurringCurrency", (data.monthlyRecurringCurrency as string) || "USD");
      if (data.monthlyRecurringExchangeRate != null) fd.set("monthlyRecurringExchangeRate", String(data.monthlyRecurringExchangeRate));
    }
    const result = await saveProject(null, fd);
    if (!result.success) throw new Error(result.message);
    setShowForm(false);
    setEditProject(null);
    router.refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDelError(null);
    const fd = new FormData();
    fd.set("id", deleteTarget.id);
    const result = await removeProject(null, fd);
    if (!result.success) {
      setDelError(result.message);
      return;
    }
    setDeleteTarget(null);
    router.refresh();
  };

  const handleToggle = async (p: Project) => {
    setActionError(null);
    const fd = new FormData();
    fd.set("id", p.id);
    fd.set("clientId", p.client.id);
    fd.set("name", p.name);
    fd.set("isActive", p.isActive ? "true" : "false");
    const result = await toggleProjectActive(null, fd);
    if (!result.success) {
      setActionError(result.message);
      return;
    }
    router.refresh();
  };

  const filtered = projects.filter((p) => {
    if (filter === "active") return p.isActive;
    if (filter === "inactive") return !p.isActive;
    return true;
  });

  const searched = search
    ? filtered.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.client.name.toLowerCase().includes(search.toLowerCase())
      )
    : filtered;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="w-full sm:w-40">
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </Select>
          <Input
            placeholder="Buscar proyecto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-w-0 sm:max-w-xs"
          />
        </div>
        <Button className="w-full sm:w-auto" onClick={() => { setEditProject(null); setShowForm(true); }}>Nuevo proyecto</Button>
      </div>

      {/* Totalizador */}
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
          {filter === "active" ? "Proyectos activos" : filter === "inactive" ? "Proyectos inactivos" : "Total de proyectos"}
        </span>
        <span className="text-lg font-bold tabular-nums text-gray-900">{searched.length}</span>
      </div>
      {actionError && <p role="alert" className="text-sm text-brick">{actionError}</p>}

      {/* DESKTOP TABLE */}
      <div className="hidden md:block">
      <DataTable tableClassName="table-fixed" headers={["Proyecto", "Cliente", "Estado", "Inicio", "Fin", "Importe acordado", "Importe mensual", "Acciones"]}
        colGroup={<colgroup><col style={{width:"22%"}} /><col style={{width:"14%"}} /><col style={{width:"7%"}} /><col style={{width:"8%"}} /><col style={{width:"8%"}} /><col style={{width:"12%"}} /><col style={{width:"12%"}} /><col style={{width:"17%"}} /></colgroup>}
      >
        {searched.length === 0 ? (
          <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
            {search ? "No hay proyectos que coincidan con la búsqueda." : "No hay proyectos para este filtro."}
          </td></tr>
        ) : searched.map((p) => (
          <tr key={p.id}>
            <td className="px-4 py-2.5 align-middle"><div className="line-clamp-2 break-words" title={p.name}><Link href={`/projects/${p.id}`} className="text-cobalt underline">{p.name}</Link></div></td>
            <td className="px-4 py-2.5 align-middle"><div className="line-clamp-2 break-words" title={p.client.name}>{p.client.name}</div></td>
            <td className="px-4 py-2.5"><Badge tone={p.isActive ? "success" : "neutral"}>{p.isActive ? "Activo" : "Inactivo"}</Badge></td>
            <td className="px-4 py-2.5 whitespace-nowrap text-sm">{fmtDate(p.startDate)}</td>
            <td className="px-4 py-2.5 whitespace-nowrap text-sm">{fmtDate(p.endDate)}</td>
            <td className="px-4 py-2.5 text-xs tabular-nums">{fmtAmount(p.oneTimeCurrency, p.oneTimeAmountUsd)}</td>
            <td className="px-4 py-2.5 text-xs tabular-nums">{fmtAmount(p.monthlyRecurringCurrency, p.monthlyRecurringAmountUsd)}</td>
            <td className="px-4 py-2.5 space-x-1 whitespace-nowrap">
              <Button variant="secondary" onClick={() => { setEditProject(p); setShowForm(true); }}>Editar</Button>
              <Button variant="secondary" onClick={() => handleToggle(p)}>{p.isActive ? "Inactivar" : "Activar"}</Button>
              {p._count.incomes === 0 && p._count.expenses === 0 && (
                <Button variant="secondary" className="text-brick" onClick={() => { setDeleteTarget(p); setDelError(null); }}>Eliminar</Button>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      </div>

      {/* MOBILE CARDS */}
      <div className="space-y-2 md:hidden">
        {searched.map((p) => (
          <div key={p.id} className="rounded-lg border border-gray-200 bg-white p-3 space-y-1.5">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <Link href={`/projects/${p.id}`} className="min-w-0 break-words font-medium text-sm text-cobalt underline">{p.name}</Link>
              <Badge tone={p.isActive ? "success" : "neutral"}>{p.isActive ? "Activo" : "Inactivo"}</Badge>
            </div>
            <div className="break-words text-xs text-gray-500">{p.client.name}</div>
            {fmtDate(p.startDate) !== "—" && <div className="text-xs text-gray-400">Inicio: {fmtDate(p.startDate)}{p.endDate ? ` · Fin: ${fmtDate(p.endDate)}` : ""}</div>}
            <div className="text-xs font-medium tabular-nums">{fmtAmount(p.oneTimeCurrency, p.oneTimeAmountUsd)}</div>
            <div className="flex gap-1 pt-1">
              <Button variant="secondary" className="text-xs flex-1" onClick={() => { setEditProject(p); setShowForm(true); }}>Editar</Button>
              <Button variant="secondary" className="text-xs flex-1" onClick={() => handleToggle(p)}>{p.isActive ? "Inactivar" : "Activar"}</Button>
              {p._count.incomes === 0 && p._count.expenses === 0 && (
                <Button variant="secondary" className="text-xs flex-1 text-brick" onClick={() => { setDeleteTarget(p); setDelError(null); }}>Eliminar</Button>
              )}
            </div>
          </div>
        ))}
        {searched.length === 0 && <p className="text-center text-gray-500 text-sm py-8">
          {search ? "No hay proyectos que coincidan con la búsqueda." : "No hay proyectos para este filtro."}
        </p>}
      </div>

      <ProjectFormModal
        open={showForm}
        title={editProject ? "Editar proyecto" : "Nuevo proyecto"}
        initial={editProject ? {
          id: editProject.id,
          clientId: editProject.client.id,
          name: editProject.name,
          isActive: editProject.isActive,
          startDate: toISODate(editProject.startDate),
          endDate: toISODate(editProject.endDate),
          goLiveDate: toISODate(editProject.goLiveDate),
          oneTimeAmountUsd: editProject.oneTimeAmountUsd ? String(editProject.oneTimeAmountUsd) : null,
          oneTimeCurrency: editProject.oneTimeCurrency,
          monthlyRecurringAmountUsd: editProject.monthlyRecurringAmountUsd ? String(editProject.monthlyRecurringAmountUsd) : null,
          monthlyRecurringCurrency: editProject.monthlyRecurringCurrency,
          client: editProject.client,
          _count: editProject._count,
        } : undefined}
        onClose={() => { setShowForm(false); setEditProject(null); }}
        onSave={handleSave}
        clients={clients}
      />

      <ConfirmActionModal
        open={!!deleteTarget}
        title="Eliminar proyecto"
        description={`¿Eliminar "${deleteTarget?.name}"? Si tiene movimientos, mejor marcalo como inactivo.`}
        confirmLabel="Eliminar"
        isPending={false}
        error={delError}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
