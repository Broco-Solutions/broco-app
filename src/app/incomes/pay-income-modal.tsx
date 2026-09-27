"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalPortal } from "@/components/ui/modal-portal";
import { todayKeyArgentina } from "@/lib/dates";

export function PayIncomeModal({
  open, income, onClose, onConfirm,
}: {
  open: boolean; income: { id: string; concept: string; amountUsd: { toString(): string } | number | string;
    amountArs: { toString(): string } | number | string | null;
    exchangeRate: { toString(): string } | number | string | null;
    client?: { name: string } | null; project?: { name: string } | null; } | null;
  onClose: () => void; onConfirm: (d: Record<string, unknown>) => Promise<void>;
}) {
  const [effDate, setEffDate] = useState(todayKeyArgentina);
  const [useArs, setUseArs] = useState(income?.amountArs != null);
  const [amountUsd, setAmountUsd] = useState(income ? (typeof income.amountUsd === "object" ? String(income.amountUsd) : String(income.amountUsd)) : "");
  const [amountArs, setAmountArs] = useState(income?.amountArs ? String(income.amountArs) : "");
  const [fx, setFx] = useState(income?.exchangeRate ? String(income.exchangeRate) : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open || !income) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setSaving(true);
    try {
      await onConfirm({ currency: useArs ? "ARS" : "USD", effectiveDate: effDate, amountUsd: useArs ? null : amountUsd, amountArs: useArs ? amountArs : null, exchangeRate: useArs ? fx : null });
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "Error."); }
    finally { setSaving(false); }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[90] overflow-y-auto px-4 py-6">
        <button className="fixed inset-0 bg-ink/45 backdrop-blur-sm" onClick={onClose} />
        <div className="relative flex min-h-full items-start justify-center sm:items-center">
          <div className="w-full max-w-md rounded-[1.5rem] bg-white p-6 shadow-[0_24px_80px_rgba(16,21,34,0.18)] overflow-x-hidden">
            <h2 className="font-display text-2xl text-ink">Marcar como cobrado</h2>
            <p className="mt-2 text-sm text-ink/50">{income.concept}</p>
            {income.client && <p className="text-sm text-ink/50">Cliente: {income.client.name}</p>}
            {income.project && <p className="text-sm text-ink/50">Proyecto: {income.project.name}</p>}
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <Input type="date" value={effDate} onChange={(e) => setEffDate(e.target.value)} required />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={useArs} onChange={(e) => setUseArs(e.target.checked)} />
                Cargar en ARS
              </label>
              {useArs ? (
                <>
                  <Input placeholder="Monto ARS" type="number" step="any" value={amountArs} onChange={(e) => setAmountArs(e.target.value)} required />
                  <Input placeholder="Tipo de cambio" type="number" step="any" value={fx} onChange={(e) => setFx(e.target.value)} required />
                </>
              ) : (
                <Input placeholder="Monto USD" type="number" step="any" value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} required />
              )}
              {error && <p className="text-sm text-brick">{error}</p>}
              <div className="flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Cobrar"}</Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
