"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ConfirmActionModal } from "@/components/ui/confirm-action-modal";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { ModalPortal } from "@/components/ui/modal-portal";
import { IncomeFormModal } from "./income-form-modal";
import { PayIncomeModal } from "./pay-income-modal";
import { saveIncome, removeIncome, payIncome, createIncomeBatch, bulkUpdateIncomes } from "./actions";
import { saveIncomeType, removeIncomeType } from "./types/actions";
import { formatUsd, formatArs, formatDate, formatIncomeStatus } from "@/lib/utils";
import { dateOnlyKey, isDateOnlyInRange, todayKeyArgentina } from "@/lib/dates";

type TY = { id: string; name: string; requiresProject: boolean };

type Income = { id: string; typeId: string; concept: string; notes: string | null; status: string;
  amountUsd: any; amountArs: any; exchangeRate: any; dueDate: string | Date | null; effectiveDate: string | Date | null;
  clientId: string | null; projectId: string | null; client: { id: string; name: string } | null;
  project: { id: string; name: string; clientId: string } | null;
  type: { id: string; name: string; requiresProject: boolean } | null; };

function fmt(v: any) { return typeof v === "object" && v != null && "toString" in v ? Number(v.toString()) : Number(v ?? 0); }

export function IncomeList({ initialIncomes, projects, clients, incomeTypes }: {
  initialIncomes: Income[]; projects: { id: string; name: string; clientId?: string }[];
  clients: { id: string; name: string }[]; incomeTypes: TY[] }) {
  const [incomes, setIncomes] = useState<Income[]>(initialIncomes);
  useEffect(() => { setIncomes(initialIncomes); }, [initialIncomes]);
  const [filter, setFilter] = useState("PAID"); const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState(""); const [dateTo, setDateTo] = useState("");
  const [fClient, setFClient] = useState(""); const [fProject, setFProject] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false); const [editing, setEditing] = useState<Income | null>(null);
  const [payTarget, setPayTarget] = useState<Income | null>(null); const [deleteTarget, setDeleteTarget] = useState<Income | null>(null);
  const [delError, setDelError] = useState<string | null>(null);
  // Type management
  const [showTypeMgmt, setShowTypeMgmt] = useState(false);
  const [typeForm, setTypeForm] = useState({ id: "", name: "", requiresProject: false });
  const [typeError, setTypeError] = useState<string | null>(null);
  const [typeDelTarget, setTypeDelTarget] = useState<TY | null>(null);
  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkField, setBulkField] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkExchangeRate, setBulkExchangeRate] = useState("");
  const [bulkDate, setBulkDate] = useState("");
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const router = useRouter();
  const sp = useSearchParams();

  const didOpen = useRef(false);
  useEffect(() => { if (!didOpen.current && sp.get("new") === "1") { didOpen.current = true; setShowForm(true); router.replace("/incomes"); } }, [sp, router]);

  // Sync filters from query params
  const didSync = useRef(false);
  useEffect(() => {
    if (didSync.current) return;
    const s = sp.get("status"); if (s === "PAID" || s === "PENDING") setFilter(s); else if (s === "OVERDUE") setFilter("OVERDUE");
    const f = sp.get("from"), t = sp.get("to");
    if (f && t) { setDateFrom(f); setDateTo(t); }
    const ty = sp.get("typeFilter"); if (ty) setTypeFilter(ty);
    const cl = sp.get("client"); if (cl) setFClient(cl);
    const pj = sp.get("project"); if (pj) setFProject(pj);
    didSync.current = true;
  }, [sp]);

  const clearRange = () => { setDateFrom(""); setDateTo(""); router.replace("/incomes"); };
  const clearFilters = () => { setFilter("PAID"); setTypeFilter(""); setFClient(""); setFProject(""); setSearch(""); clearRange(); };

  const reload = () => { setTimeout(() => { router.refresh(); }, 300); };
  const mkFd = (data: Record<string, unknown>, id?: string) => {
    const fd = new FormData(); if (id) fd.set("id", id);
    Object.entries(data).forEach(([k,v]) => { if (v != null && v !== "") fd.set(k, String(v)); });
    return fd;
  };

  const handleSave = async (data: Record<string, unknown>) => {
    const batch = data.batch as Array<Record<string, unknown>> | undefined;
    if (batch) {
      const entries = batch.map(r => ({
        typeId: data.typeId as string, projectId: (data.projectId as string) || null, clientId: (data.clientId as string) || null,
        concept: data.concept as string, notes: (data.notes as string) || null, status: r.status as string,
        amountUsd: data.useArs ? undefined : ((r.amountUsd as string) ? Number(r.amountUsd) : undefined),
        amountArs: data.useArs ? ((r.amountArs as string) ? Number(r.amountArs) : undefined) : undefined,
        exchangeRate: (r.exchangeRate as string) ? Number(r.exchangeRate) : undefined,
        dueDate: r.status === "PENDING" ? (r.date as string) : null,
        effectiveDate: r.status === "PAID" ? (r.date as string) : null,
      }));
      const result = await createIncomeBatch(entries);
      if (!result.success) throw new Error(result.message);
      setShowForm(false); setEditing(null); reload();
    } else {
      const fd = mkFd({
        ...data,
        amountUsd: data.useArs ? undefined : data.amountUsd,
        amountArs: data.useArs ? data.amountArs : undefined,
        exchangeRate: data.useArs ? data.exchangeRate : undefined,
      }, editing?.id);
      const result = await saveIncome(null, fd);
      if (!result.success) throw new Error(result.message);
      setShowForm(false); setEditing(null); reload();
    }
  };
  const handlePay = async (data: Record<string, unknown>) => {
    if (!payTarget) return;
    const fd = mkFd({ effectiveDate: data.effectiveDate, amountUsd: data.amountUsd, amountArs: data.amountArs, exchangeRate: data.exchangeRate }, payTarget.id);
    const result = await payIncome(null, fd);
    if (!result.success) throw new Error(result.message);
    setPayTarget(null); reload();
  };
  const handleDelete = async () => {
    if (!deleteTarget) return;
    const fd = mkFd({}, deleteTarget.id);
    const result = await removeIncome(null, fd);
    if (!result.success) throw new Error(result.message);
    setDeleteTarget(null); reload();
  };

  // Type management handlers
  const handleTypeSave = async (ev: React.FormEvent) => {
    ev.preventDefault(); setTypeError(null);
    const fd = new FormData();
    if (typeForm.id) fd.set("id", typeForm.id);
    fd.set("name", typeForm.name);
    fd.set("requiresProject", typeForm.requiresProject ? "true" : "false");
    const result = await saveIncomeType(null, fd);
    if (!result.success) { setTypeError(result.message); return; }
    setTypeForm({ id: "", name: "", requiresProject: false });
    reload();
  };
  const handleTypeDel = async () => {
    if (!typeDelTarget) return;
    const fd = new FormData();
    fd.set("id", typeDelTarget.id);
    const result = await removeIncomeType(null, fd);
    if (!result.success) { setTypeError(result.message); return; }
    setTypeDelTarget(null);
    reload();
  };

  const filtered = [...incomes]
    .filter((inc) => {
      const idParam = sp.get("id");
      if (idParam && inc.id !== idParam) return false;
      if (filter === "PENDING" && inc.status !== "PENDING") return false;
      if (filter === "PAID" && inc.status !== "PAID") return false;
      if (filter === "OVERDUE") {
        if (inc.status !== "PENDING") return false;
        const todayKey = todayKeyArgentina();
        const dueKey = dateOnlyKey(inc.dueDate);
        return !!dueKey && dueKey < todayKey;
      }
      if (typeFilter && inc.typeId !== typeFilter) return false;
      if (fClient && inc.clientId !== fClient) return false;
      if (fProject && inc.projectId !== fProject) return false;
      if (search && !inc.concept.toLowerCase().includes(search.toLowerCase())) return false;
      if (dateFrom || dateTo) {
        if (dateFrom && dateTo && dateFrom > dateTo) return true;
        const targetDate = inc.status === "PAID" ? inc.effectiveDate : inc.dueDate;
        if (!isDateOnlyInRange(targetDate, dateFrom || null, dateTo || null)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const ka = dateOnlyKey(a.status === "PAID" ? a.effectiveDate : a.dueDate) ?? "";
      const kb = dateOnlyKey(b.status === "PAID" ? b.effectiveDate : b.dueDate) ?? "";
      return kb.localeCompare(ka);
    });

  const filteredTotal = filtered.reduce((s, inc) => s + fmt(inc.amountUsd), 0);

  // Bulk selection handlers
  const toggleSelect = (id: string) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectAllFiltered = () => setSelected(new Set(filtered.map(inc => inc.id)));
  const clearSelection = () => setSelected(new Set());
  const allSelected = filtered.length > 0 && filtered.every(inc => selected.has(inc.id));
  const toggleAll = () => allSelected ? clearSelection() : selectAllFiltered();
  const handleBulkApply = async () => {
    if (!bulkField || !bulkValue) return;
    if (bulkField === "concept" && !bulkValue.trim()) return;
    if (bulkField === "ars" && !bulkExchangeRate) return;
    setBulkError(null);
    const ids = Array.from(selected);
    const updates: Record<string, unknown> = {};
    if (bulkField === "concept") updates.concept = bulkValue.trim();
    else if (bulkField === "type") updates.typeId = bulkValue;
    else if (bulkField === "status") updates.status = bulkValue;
    else if (bulkField === "amount") updates.amountUsd = Number(bulkValue);
    else if (bulkField === "ars") { updates.amountArs = Number(bulkValue); updates.exchangeRate = Number(bulkExchangeRate); }
    if (bulkField === "status") updates.statusDate = bulkDate;
    const result = await bulkUpdateIncomes(ids, updates);
    if (!result.success) { setBulkError(result.message); return; }
    setShowBulkConfirm(false);
    setBulkField(""); setBulkValue(""); setBulkExchangeRate(""); setBulkDate("");
    clearSelection();
    reload();
  };
  // Clear selection when filters change
  useEffect(() => { clearSelection(); }, [sp]);

  const statusLabel = (s: string, d: any) => formatIncomeStatus(s, d);
  const statusTone = (s: string, d: any): "success" | "danger" | "warning" | "neutral" => { const l = statusLabel(s, d); if (l === "Cobrado") return "success"; if (l === "Vencido") return "danger"; if (l === "Pendiente") return "warning"; return "neutral"; };
  const typeName = (id: string) => incomeTypes.find(t => t.id === id)?.name ?? "—";
  const bulkFieldLabels: Record<string, string> = { concept: "Concepto", type: "Tipo", status: "Estado", amount: "Monto USD", ars: "Monto ARS + TC" };
  const bulkValueLabels: Record<string, Record<string, string>> = { type: Object.fromEntries(incomeTypes.map(t => [t.id, t.name])), status: { PAID: "Cobrado", PENDING: "Pendiente" } };
  const bulkDesc = `${bulkFieldLabels[bulkField] ?? "?"} → ${bulkValueLabels[bulkField]?.[bulkValue] ?? bulkValue}${bulkField === "status" && bulkDate ? ` (${bulkDate})` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2 flex-wrap">
            <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-28 text-xs">
              <option value="all">Todos</option><option value="PAID">Cobrados</option><option value="PENDING">Pendientes</option><option value="OVERDUE">Vencidos</option>
            </Select>
            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-36 text-xs">
              <option value="">Tipos</option>{incomeTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <SearchableSelect value={fClient} onChange={(v) => { setFClient(v); setFProject(""); }} options={clients} placeholder="Cliente" className="w-36 text-xs" />
            <SearchableSelect value={fProject} onChange={(v) => setFProject(v)} options={projects.filter(p => !fClient || p.clientId === fClient)} placeholder="Proyecto" className="w-36 text-xs" disabled={!fClient} />
            <Input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="w-36 text-xs" placeholder="Buscar concepto…" />
            <div className="flex items-center gap-1">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-32 text-xs h-8" placeholder="Desde" />
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-32 text-xs h-8" placeholder="Hasta" />
              {(dateFrom || dateTo) && <Button variant="ghost" className="text-xs" onClick={clearRange}>Limpiar fechas</Button>}
            </div>
          </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" className="text-xs" onClick={() => setShowTypeMgmt(true)}>Tipos</Button>
          <Button onClick={() => { setEditing(null); setShowForm(true); }}>Nuevo ingreso</Button>
        </div>
      </div>

      {/* Filtered total */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm">
        <span className="text-gray-500">Total filtrado · <span className="font-medium">{filtered.length} movimientos</span></span>
        <span className="font-bold tabular-nums text-gray-900">{formatUsd(filteredTotal)}</span>
      </div>
      {(dateFrom || dateTo || filter !== "all" || typeFilter || fClient || fProject || search) && (
        <div className="flex items-center gap-2 flex-wrap">
          {dateFrom && dateTo && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{dateFrom.split("-").reverse().join("/")} – {dateTo.split("-").reverse().join("/")}</span>}
          {filter !== "all" && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{filter === "PAID" ? "Cobrados" : filter === "PENDING" ? "Pendientes" : "Vencidos"}</span>}
          <button onClick={clearFilters} className="text-xs text-gray-400 underline hover:text-gray-600">Limpiar filtros</button>
        </div>
      )}

      {/* DESKTOP TABLE */}
      <div className="hidden md:block">
        <DataTable tableClassName="table-fixed"
          headers={[<input key="cb" type="checkbox" checked={allSelected} onChange={toggleAll} className="h-3.5 w-3.5" />,"Concepto","Cliente","Proyecto","Tipo","Estado","Fecha","USD","ARS","Acciones"]}
          colGroup={<colgroup><col style={{width:"3%"}} /><col style={{width:"16%"}} /><col style={{width:"11%"}} /><col style={{width:"11%"}} /><col style={{width:"8%"}} /><col style={{width:"8%"}} /><col style={{width:"9%"}} /><col style={{width:"10%"}} /><col style={{width:"12%"}} /><col style={{width:"12%"}} /></colgroup>}
          footer={<tr className="bg-gray-50 font-semibold"><td className="px-4 py-2.5 text-xs text-gray-500">Total filtrado · {filtered.length} mov.</td><td /><td /><td /><td /><td /><td className="px-4 py-2.5 text-sm text-right tabular-nums">{formatUsd(filteredTotal)}</td><td /><td /></tr>}
        >
          {filtered.length === 0 ? <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-500">
            {search || dateFrom || dateTo || typeFilter || fClient || fProject || filter !== "all" ? "No hay ingresos para los filtros actuales." : "Todavía no hay ingresos."}
          </td></tr> : filtered.map(inc => (
            <tr key={inc.id}>
              <td className="px-2 py-2.5"><input type="checkbox" checked={selected.has(inc.id)} onChange={() => toggleSelect(inc.id)} className="h-3.5 w-3.5" /></td>
              <td className="px-4 py-2.5 text-sm align-middle"><div className="line-clamp-2 break-words" title={inc.concept}>{inc.concept}</div></td>
              <td className="px-4 py-2.5 text-sm align-middle"><div className="line-clamp-2 break-words" title={inc.client?.name ?? ""}>{inc.client?.name ?? "—"}</div></td>
              <td className="px-4 py-2.5 text-sm align-middle"><div className="line-clamp-2 break-words" title={inc.project?.name ?? ""}>{inc.project?.name ?? "—"}</div></td>
              <td className="px-4 py-2.5 text-sm whitespace-nowrap">{inc.type?.name ?? "—"}</td>
              <td className="px-4 py-2.5"><Badge tone={statusTone(inc.status, inc.dueDate)}>{statusLabel(inc.status, inc.dueDate)}</Badge></td>
              <td className="px-4 py-2.5 text-sm tabular-nums whitespace-nowrap">{inc.status === "PAID" ? formatDate(inc.effectiveDate) : formatDate(inc.dueDate)}</td>
              <td className="px-4 py-2.5 text-sm text-right tabular-nums">{formatUsd(fmt(inc.amountUsd))}</td>
              <td className="px-4 py-2.5 text-sm text-right tabular-nums">{inc.amountArs ? `${formatArs(fmt(inc.amountArs))} · TC ${fmt(inc.exchangeRate)}` : "—"}</td>
              <td className="px-4 py-2.5 space-x-1 whitespace-nowrap">
                {inc.status === "PENDING" && <Button variant="secondary" className="text-xs" onClick={() => setPayTarget(inc)}>Cobrar</Button>}
                <Button variant="secondary" className="text-xs" onClick={() => { setEditing(inc); setShowForm(true); }}>Editar</Button>
                <Button variant="secondary" className="text-xs text-brick" onClick={() => { setDeleteTarget(inc); setDelError(null); }}>Elim.</Button>
              </td>
            </tr>
          ))}
        </DataTable>
      </div>

      {/* MOBILE CARDS */}
      <div className="space-y-2 md:hidden">
        {filtered.map(inc => (
          <div key={inc.id} className="rounded-lg border border-gray-200 bg-white p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">{inc.concept}</span>
              <Badge tone={statusTone(inc.status, inc.dueDate)}>{statusLabel(inc.status, inc.dueDate)}</Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{inc.type?.name ?? "—"}</span>
              <span className="font-semibold tabular-nums">{formatUsd(fmt(inc.amountUsd))}</span>
            </div>
            <div className="text-xs text-gray-400 flex justify-between">
              <span>{inc.client?.name ?? "—"}{inc.project ? ` · ${inc.project.name}` : ""}</span>
              <span>{inc.status === "PAID" ? formatDate(inc.effectiveDate) : formatDate(inc.dueDate)}</span>
            </div>
            {inc.amountArs && <div className="text-xs text-gray-500 text-right">{formatArs(fmt(inc.amountArs))} · TC {fmt(inc.exchangeRate)}</div>}
            <div className="flex gap-1 pt-1">
              {inc.status === "PENDING" && <Button variant="secondary" className="text-xs flex-1" onClick={() => setPayTarget(inc)}>Cobrar</Button>}
              <Button variant="secondary" className="text-xs flex-1" onClick={() => { setEditing(inc); setShowForm(true); }}>Editar</Button>
              <Button variant="secondary" className="text-xs flex-1 text-brick" onClick={() => { setDeleteTarget(inc); setDelError(null); }}>Elim.</Button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-center text-gray-500 text-sm py-8">
          {search || dateFrom || dateTo || typeFilter || fClient || fProject || filter !== "all" ? "No hay ingresos para los filtros actuales." : "Todavía no hay ingresos."}
        </p>}
      </div>

      <IncomeFormModal open={showForm} title={editing ? "Editar ingreso" : "Nuevo ingreso"} projects={projects} clients={clients} incomeTypes={incomeTypes}
        initial={editing ? { id: editing.id, typeId: editing.typeId, concept: editing.concept, notes: editing.notes, status: editing.status, projectId: editing.projectId, clientId: editing.clientId, amountUsd: editing.amountUsd, amountArs: editing.amountArs, exchangeRate: editing.exchangeRate, dueDate: editing.dueDate ? (editing.dueDate instanceof Date ? editing.dueDate.toISOString().slice(0,10) : String(editing.dueDate).slice(0,10)) : null, effectiveDate: editing.effectiveDate ? (editing.effectiveDate instanceof Date ? editing.effectiveDate.toISOString().slice(0,10) : String(editing.effectiveDate).slice(0,10)) : null, client: editing.client, project: editing.project, type: editing.type } : undefined}
        onClose={() => { setShowForm(false); setEditing(null); }} onSave={handleSave} />

      <PayIncomeModal open={!!payTarget} income={payTarget} onClose={() => setPayTarget(null)} onConfirm={handlePay} />
      <ConfirmActionModal open={!!deleteTarget} title={deleteTarget?.status === "PAID" ? "Eliminar ingreso cobrado" : "Eliminar ingreso"}
        description={deleteTarget?.status === "PAID" ? "Este ingreso ya esta cobrado. ¿Confirmas que queres eliminarlo?" : `¿Eliminar "${deleteTarget?.concept}"?`}
        confirmLabel="Eliminar" isPending={false} error={delError} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />

      <BulkActionBar
        count={selected.size}
        totalFiltered={filtered.length}
        onSelectAll={selectAllFiltered}
        onClear={() => { clearSelection(); setBulkField(""); setBulkValue(""); setBulkExchangeRate(""); setBulkDate(""); }}
        onApply={() => setShowBulkConfirm(true)}
        field={bulkField} setField={(f) => { setBulkField(f); setBulkValue(""); setBulkExchangeRate(""); }}
        value={bulkValue} setValue={setBulkValue}
        secondaryValue={bulkExchangeRate} setSecondaryValue={setBulkExchangeRate}
        secondaryPlaceholder="TC"
        dateValue={bulkDate} setDateValue={setBulkDate}
        fields={[
          { value: "concept", label: "Concepto" },
          { value: "type", label: "Tipo" },
          { value: "status", label: "Estado" },
          { value: "amount", label: "Monto USD" },
          { value: "ars", label: "Monto ARS + TC" },
        ]}
        options={{
          type: incomeTypes.map(t => ({ value: t.id, label: t.name })),
          status: [{ value: "PAID", label: "Cobrado" }, { value: "PENDING", label: "Pendiente" }],
          amount: [], ars: [],
        }}
        disabled={!bulkField || !bulkValue}
      />

      <ConfirmActionModal
        open={showBulkConfirm}
        title={`Actualizar ${selected.size} ingreso${selected.size !== 1 ? "s" : ""}`}
        description={`Cambiar ${bulkDesc}`}
        confirmLabel="Aplicar"
        isPending={false}
        error={bulkError}
        onClose={() => { setShowBulkConfirm(false); setBulkError(null); }}
        onConfirm={handleBulkApply}
      />

      {/* Type management */}
      {showTypeMgmt && <ModalPortal><div className="fixed inset-0 z-[90] overflow-y-auto"><button className="fixed inset-0 bg-black/50" onClick={() => setShowTypeMgmt(false)} /><div className="relative flex min-h-full items-center justify-center p-4"><div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl overflow-x-hidden"><h2 className="text-lg font-bold">Tipos de ingreso</h2>
      <div className="mt-3 space-y-1 max-h-64 overflow-y-auto">{incomeTypes.map(t => <div key={t.id} className="flex items-center justify-between rounded border p-2 text-sm"><span>{t.name} {t.requiresProject && <span className="text-gray-400 text-xs">(requiere proyecto)</span>}</span><div className="space-x-1"><Button variant="secondary" className="text-xs" onClick={() => setTypeForm({ id: t.id, name: t.name, requiresProject: t.requiresProject })}>Editar</Button><Button variant="secondary" className="text-xs text-brick" onClick={() => { setTypeDelTarget(t); setTypeError(null); }}>Elim.</Button></div></div>)}</div>
      <form onSubmit={handleTypeSave} className="mt-3 space-y-2">
        <Input placeholder="Nombre" value={typeForm.name} onChange={(e) => setTypeForm(p => ({...p, name: e.target.value}))} required />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={typeForm.requiresProject} onChange={(e) => setTypeForm(p => ({...p, requiresProject: e.target.checked}))} /> Requiere proyecto</label>
        <div className="flex gap-2"><Button type="submit" className="text-xs">{typeForm.id ? "Guardar" : "Crear"}</Button>{typeForm.id && <Button type="button" variant="ghost" className="text-xs" onClick={() => setTypeForm({ id: "", name: "", requiresProject: false })}>Nuevo</Button>}</div>
      </form>
      {typeError && <p className="text-sm text-red-600 mt-1">{typeError}</p>}
      <div className="flex justify-end mt-3"><Button variant="ghost" onClick={() => { setShowTypeMgmt(false); setTypeForm({ id: "", name: "", requiresProject: false }); }}>Cerrar</Button></div>
      </div></div></div></ModalPortal>}

      <ConfirmActionModal open={!!typeDelTarget} title="Eliminar tipo" description={`¿Eliminar "${typeDelTarget?.name}"?`} confirmLabel="Eliminar" isPending={false} error={null} onClose={() => setTypeDelTarget(null)} onConfirm={handleTypeDel} />
    </div>
  );
}
