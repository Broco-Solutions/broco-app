"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ModalPortal } from "@/components/ui/modal-portal";

type PO = { id: string; name: string; clientId?: string };
type CO = { id: string; name: string };
type TY = { id: string; name: string; requiresProject: boolean };
type Row = { status: "PAID"|"PENDING"; date: string; amountUsd: string; amountArs: string; exchangeRate: string };

export function IncomeFormModal({
  open, onClose, onSave, initial, title, projects, clients, incomeTypes,
}: {
  open: boolean; onClose: () => void; onSave: (d: Record<string, unknown>) => Promise<void>;
  initial?: { id?: string; typeId?: string; concept?: string; notes?: string | null; status?: string;
    projectId?: string | null; clientId?: string | null;
    amountUsd?: { toString(): string } | number | string | null;
    amountArs?: { toString(): string } | number | string | null;
    exchangeRate?: { toString(): string } | number | string | null;
    dueDate?: string | null; effectiveDate?: string | null;
    client?: CO | null; project?: PO | null; type?: { id: string; name: string; requiresProject: boolean } | null; };
  title: string; projects: PO[]; clients: CO[]; incomeTypes: TY[];
}) {
  const editing = !!initial?.id;
  const useArs = initial?.amountArs != null || initial?.exchangeRate != null;
  const defStatus = (initial?.status ?? "PAID") as "PAID"|"PENDING";
  const defDate = defStatus === "PAID" ? (initial?.effectiveDate ?? "") : (initial?.dueDate ?? "");
  const defClientId = initial?.clientId ?? initial?.project?.clientId ?? initial?.client?.id ?? "";
  const defTypeId = initial?.typeId ?? initial?.type?.id ?? incomeTypes[0]?.id ?? "";
  const [form, setForm] = useState({
    typeId: defTypeId, concept: initial?.concept ?? "", notes: initial?.notes ?? "",
    status: defStatus, clientId: defClientId, projectId: initial?.projectId ?? "",
    useArs, amountUsd: initial?.amountUsd ? String(initial?.amountUsd) : "",
    amountArs: initial?.amountArs ? String(initial?.amountArs) : "",
    exchangeRate: initial?.exchangeRate ? String(initial?.exchangeRate) : "",
    dueDate: defStatus === "PENDING" ? defDate : "", effectiveDate: defStatus === "PAID" ? defDate : "",
  });
  const [multi, setMulti] = useState(false);
  const [count, setCount] = useState(3);
  const [interval, setInterval] = useState(30);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const needsProject = incomeTypes.find(t => t.id === form.typeId)?.requiresProject ?? false;

  // Reset form when initial changes (fixes edit mode hydration)
  useEffect(() => {
    if (!open) return;
    const s = (initial?.status ?? "PAID") as "PAID"|"PENDING";
    const d = s === "PAID" ? (initial?.effectiveDate ?? "") : (initial?.dueDate ?? "");
    const cid = initial?.clientId ?? initial?.project?.clientId ?? initial?.client?.id ?? "";
    const ars = initial?.amountArs != null || initial?.exchangeRate != null;
    const tid = initial?.typeId ?? initial?.type?.id ?? incomeTypes[0]?.id ?? "";
    setForm({
      typeId: tid, concept: initial?.concept ?? "", notes: initial?.notes ?? "",
      status: s, clientId: cid, projectId: initial?.projectId ?? "",
      useArs: ars, amountUsd: initial?.amountUsd ? String(initial?.amountUsd) : "",
      amountArs: initial?.amountArs ? String(initial?.amountArs) : "",
      exchangeRate: initial?.exchangeRate ? String(initial?.exchangeRate) : "",
      dueDate: s === "PENDING" ? d : "", effectiveDate: s === "PAID" ? d : "",
    });
    setMulti(false); setRows([]);
  }, [open, initial, incomeTypes]);

  // Filter projects by selected client
  const filteredProjects = useMemo(() => {
    if (!form.clientId) return editing ? projects : [];
    return projects.filter(p => p.clientId === form.clientId || (editing && p.id === form.projectId));
  }, [form.clientId, projects, editing, form.projectId]);

  const initRows = () => {
    const baseDate = form.status === "PAID" ? form.effectiveDate : form.dueDate;
    const d = new Date(baseDate || new Date().toISOString().slice(0,10));
    const arr: Row[] = [];
    for (let i = 0; i < count; i++) {
      const rd = new Date(d.getTime() + i * interval * 86400000);
      arr.push({ status: form.status, date: rd.toISOString().slice(0, 10), amountUsd: form.amountUsd, amountArs: form.amountArs, exchangeRate: form.exchangeRate });
    }
    setRows(arr);
  };

  // Dynamic: change count
  const setCountDynamic = (v: number) => {
    const n = Math.max(2, v || 2);
    setCount(n);
    if (n > rows.length) {
      const base = rows.length > 0 ? new Date(rows[rows.length-1].date) : new Date();
      const extra: Row[] = [];
      for (let i = rows.length; i < n; i++) {
        const rd = new Date(base.getTime() + (i - rows.length + 1) * interval * 86400000);
        extra.push({ status: form.status, date: rd.toISOString().slice(0,10), amountUsd: form.amountUsd, amountArs: form.amountArs, exchangeRate: form.exchangeRate });
      }
      setRows([...rows, ...extra]);
    } else { setRows(rows.slice(0, n)); }
  };

  // Dynamic: recalc on first date change
  const onFirstDateChange = (d: string) => {
    if (form.status === "PENDING") setForm(p => ({...p, dueDate: d})); else setForm(p => ({...p, effectiveDate: d}));
    if (rows.length > 0) {
      const base = new Date(d);
      setRows(rows.map((r, i) => ({ ...r, date: new Date(base.getTime() + i * interval * 86400000).toISOString().slice(0,10) })));
    }
  };

  // Dynamic: recalc on interval change
  const onIntervalChange = (v: number) => {
    setInterval(v);
    if (rows.length > 0) {
      const base = form.status === "PENDING" ? form.dueDate : form.effectiveDate;
      const d = new Date(base || new Date());
      setRows(rows.map((r, i) => ({ ...r, date: new Date(d.getTime() + i * v * 86400000).toISOString().slice(0,10) })));
    }
  };

  // Dynamic: recalc amounts
  const onAmountChange = (usd: string, ars: string) => {
    setForm(p => ({...p, amountUsd: usd, amountArs: ars}));
    setRows(prev => prev.map(r => ({ ...r, amountUsd: usd, amountArs: ars })));
  };

  const updateRow = (i: number, f: Partial<Row>) => setRows(prev => prev.map((r, j) => j === i ? { ...r, ...f } : r));
  const removeRow = (i: number) => { if (rows.length > 2) setRows(prev => prev.filter((_, j) => j !== i)); else setCountDynamic(rows.length - 1); };
  const addRow = () => {
    const last = rows[rows.length - 1];
    const d = last ? new Date(last.date) : new Date();
    d.setDate(d.getDate() + interval);
    setRows(prev => [...prev, { ...(last || { status: form.status, date: "", amountUsd: form.amountUsd, amountArs: form.amountArs, exchangeRate: form.exchangeRate }), date: d.toISOString().slice(0, 10) }]);
    setCount(rows.length + 1);
  };

  const totalUsd = rows.reduce((s, r) => s + (Number(r.amountUsd) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setSaving(true);
    try {
      if (multi) {
        await onSave({ ...form, batch: rows.map(r => ({ ...r, amountUsd: form.useArs ? undefined : r.amountUsd || undefined, amountArs: form.useArs ? r.amountArs || undefined : undefined, exchangeRate: form.useArs ? r.exchangeRate || undefined : undefined })) });
      } else { await onSave(form); }
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "Error."); }
    finally { setSaving(false); }
  };

  if (!open) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[90] overflow-y-auto px-4 py-6">
        <button className="fixed inset-0 bg-ink/45 backdrop-blur-sm" onClick={onClose} />
        <div className="relative flex min-h-full items-start justify-center sm:items-center">
          <div className="w-full max-w-lg rounded-[1.5rem] bg-white p-6 shadow-[0_24px_80px_rgba(16,21,34,0.18)] overflow-x-hidden">
            <h2 className="font-display text-2xl text-ink">{title}</h2>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <Select value={form.typeId} onChange={(e) => setForm((p) => ({ ...p, typeId: e.target.value }))} required>
                <option value="">Seleccionar tipo *</option>
                {incomeTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>

              {/* Client → Project selector */}
              <Select value={form.clientId} onChange={(e) => { setForm(p => ({...p, clientId: e.target.value, projectId: ""})); }}>
                <option value="">Seleccionar cliente{needsProject ? " *" : ""}</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select value={form.projectId} onChange={(e) => setForm(p => ({...p, projectId: e.target.value}))} disabled={!form.clientId} required={needsProject}>
                <option value="">{needsProject ? "Seleccionar proyecto *" : "Sin proyecto"}</option>
                {filteredProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>

              <Input placeholder="Concepto *" value={form.concept} onChange={(e) => setForm((p) => ({ ...p, concept: e.target.value }))} required />
              <Input placeholder="Notas" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />

              {!multi && (
                <>
                  <Select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as "PAID" | "PENDING" }))}>
                    <option value="PAID">Cobrado</option>
                    <option value="PENDING">Pendiente</option>
                  </Select>
                  {form.status === "PENDING" && <Input type="date" value={form.dueDate} onChange={(e) => setForm(p => ({...p, dueDate: e.target.value}))} required />}
                  {form.status === "PAID" && <Input type="date" value={form.effectiveDate} onChange={(e) => setForm(p => ({...p, effectiveDate: e.target.value}))} required />}
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.useArs} onChange={(e) => setForm((p) => e.target.checked ? ({ ...p, useArs: true, amountUsd: "" }) : ({ ...p, useArs: false, amountArs: "", exchangeRate: "" }))} /> Cargar en ARS</label>
                  {form.useArs ? (
                    <div className="space-y-2 pl-4 border-l-2 border-cobalt/20">
                      <Input placeholder="Monto ARS" type="number" step="any" value={form.amountArs} onChange={(e) => { setForm(p => ({...p, amountArs: e.target.value})); onAmountChange("", e.target.value); }} required />
                      <Input placeholder="Tipo de cambio" type="number" step="any" value={form.exchangeRate} onChange={(e) => setForm((p) => ({ ...p, exchangeRate: e.target.value }))} required />
                    </div>
                  ) : (
                    <Input placeholder="Monto USD" type="number" step="any" value={form.amountUsd} onChange={(e) => { setForm(p => ({...p, amountUsd: e.target.value})); onAmountChange(e.target.value, ""); }} required />
                  )}
                </>
              )}

              {/* Multi-income checkbox */}
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={multi} onChange={(e) => { setMulti(e.target.checked); if (e.target.checked) { setCount(3); setInterval(30); setTimeout(initRows, 0); } }} />
                Agregar varios ingresos
              </label>

              {multi && (
                <div className="space-y-3 pl-4 border-l-2 border-brand/20 min-w-0">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 min-w-0"><label className="text-xs text-gray-500">Cantidad (mín 2)</label><Input type="number" min={2} value={String(count)} onChange={(e) => setCountDynamic(Number(e.target.value)||2)} /></div>
                    <div className="flex-1 min-w-0"><label className="text-xs text-gray-500">Intervalo (días)</label><Input type="number" min={1} value={String(interval)} onChange={(e) => onIntervalChange(Math.max(1, Number(e.target.value)||1))} /></div>
                  </div>

                  <Select value={form.status} onChange={(e) => setForm(p => ({...p, status: e.target.value as "PAID"|"PENDING"}))}><option value="PAID">Cobrado</option><option value="PENDING">Pendiente</option></Select>
                  <Input type="date" value={form.status === "PENDING" ? form.dueDate : form.effectiveDate} onChange={(e) => onFirstDateChange(e.target.value)} placeholder="Primera fecha" required />

                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.useArs} onChange={(e) => { const useArs = e.target.checked; setForm((p) => useArs ? ({ ...p, useArs: true, amountUsd: "" }) : ({ ...p, useArs: false, amountArs: "", exchangeRate: "" })); setRows((prev) => prev.map((r) => useArs ? ({ ...r, amountUsd: "" }) : ({ ...r, amountArs: "", exchangeRate: "" }))); }} /> Cargar en ARS</label>
                  {form.useArs ? (
                    <div className="space-y-2"><Input placeholder="Monto ARS" type="number" step="any" value={form.amountArs} onChange={(e) => { setForm(p => ({...p, amountArs: e.target.value})); onAmountChange("", e.target.value); }} required /><Input placeholder="Tipo de cambio" type="number" step="any" value={form.exchangeRate} onChange={(e) => setForm(p => ({...p, exchangeRate: e.target.value}))} required /></div>
                  ) : (
                    <Input placeholder="Monto USD" type="number" step="any" value={form.amountUsd} onChange={(e) => { setForm(p => ({...p, amountUsd: e.target.value})); onAmountChange(e.target.value, ""); }} required />
                  )}

                  <div className="space-y-2 max-h-[40vh] overflow-y-auto overflow-x-auto">
                    {rows.map((r, i) => (
                      <div key={i} className="flex gap-1 items-center text-xs border rounded-lg p-1.5 bg-gray-50">
                        <span className="w-5 text-gray-400">{i+1}</span>
                        <Select value={r.status} onChange={(e) => updateRow(i, { status: e.target.value as "PAID"|"PENDING" })} className="w-20 text-xs h-7"><option value="PAID">Cobrado</option><option value="PENDING">Pendiente</option></Select>
                        <Input type="date" value={r.date} onChange={(e) => updateRow(i, { date: e.target.value })} className="w-32 text-xs h-7" />
                        {form.useArs ? (<><Input type="number" step="any" value={r.amountArs} onChange={(e) => updateRow(i, { amountArs: e.target.value })} className="w-24 text-xs h-7" placeholder="ARS" /><Input type="number" step="any" value={r.exchangeRate} onChange={(e) => updateRow(i, { exchangeRate: e.target.value })} className="w-20 text-xs h-7" placeholder="TC" /></>) : (<Input type="number" step="any" value={r.amountUsd} onChange={(e) => updateRow(i, { amountUsd: e.target.value })} className="w-24 text-xs h-7" placeholder="USD" />)}
                        <button type="button" onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 text-lg leading-none px-1" title="Eliminar fila">×</button>
                      </div>
                    ))}
                  </div>
                  <Button variant="secondary" type="button" className="text-xs" onClick={addRow}>+ Agregar fila</Button>
                  <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2">Se crearán {rows.length} ingresos{form.useArs ? "" : ` — Total USD ${totalUsd.toLocaleString("es-AR", {minimumFractionDigits:2})}`}</div>
                </div>
              )}

              {error && <p className="text-sm text-brick">{error}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? "Guardando..." : multi ? `Guardar ${rows.length} ingresos` : "Guardar"}</Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
