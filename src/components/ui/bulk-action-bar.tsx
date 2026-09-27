"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Props = {
  count: number;
  totalFiltered: number;
  onSelectAll: () => void;
  onClear: () => void;
  onApply: () => void;
  field: string;
  setField: (f: string) => void;
  value: string;
  setValue: (v: string) => void;
  secondaryValue?: string;
  setSecondaryValue?: (v: string) => void;
  secondaryPlaceholder?: string;
  dateValue?: string;
  setDateValue?: (v: string) => void;
  fields: Array<{ value: string; label: string }>;
  options: Record<string, Array<{ value: string; label: string }>>;
  disabled: boolean;
};

export function BulkActionBar({
  count, totalFiltered, onSelectAll, onClear, onApply,
  field, setField, value, setValue,
  secondaryValue, setSecondaryValue, secondaryPlaceholder,
  dateValue, setDateValue,
  fields, options, disabled,
}: Props) {
  if (count === 0) return null;

  const currentOptions = options[field] || [];
  const needsSecondary = (field === "ars" || field === "amountArs") && setSecondaryValue;
  const needsDate = field === "status" && setDateValue;
  const isConceptEmpty = field === "concept" && !value.trim();
  const disabledButton = disabled || isConceptEmpty || (needsSecondary && !secondaryValue) || (needsDate && !dateValue);

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 border-t border-gray-200 bg-white/95 backdrop-blur p-3 shadow-lg">
      <div className="flex flex-wrap items-center gap-3 max-w-7xl mx-auto">
        <span className="text-sm font-medium text-gray-700">{count} seleccionados</span>
        {count < totalFiltered && (
          <button onClick={onSelectAll} className="text-xs text-blue-600 underline hover:text-blue-800">
            Seleccionar los {totalFiltered} filtrados
          </button>
        )}
        <span className="text-gray-300">|</span>
        <span className="text-xs text-gray-500">Cambiar:</span>
        <Select value={field} onChange={(e) => { setField(e.target.value); setValue(""); setDateValue?.(""); }} className="w-32 text-xs">
          <option value="">Campo...</option>
          {fields.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </Select>
        {field && (
          <>
            <span className="text-xs text-gray-500">a:</span>
            {currentOptions.length > 0 ? (
              <Select value={value} onChange={(e) => setValue(e.target.value)} className="w-36 text-xs">
                <option value="">Seleccionar...</option>
                {currentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            ) : field === "concept" ? (
              <Input type="text" value={value} onChange={(e) => setValue(e.target.value)} className="w-48 text-xs" placeholder="Concepto" />
            ) : (
              <Input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} className="w-24 text-xs" placeholder="Monto" />
            )}
            {needsSecondary && setSecondaryValue && (
              <Input type="number" step="any" value={secondaryValue ?? ""} onChange={(e) => setSecondaryValue(e.target.value)} className="w-20 text-xs" placeholder={secondaryPlaceholder ?? "TC"} />
            )}
            {needsDate && (
              <Input type="date" value={dateValue ?? ""} onChange={(e) => setDateValue(e.target.value)} className="w-36 text-xs" aria-label="Fecha del nuevo estado" />
            )}
          </>
        )}
        <Button onClick={onApply} disabled={disabledButton} className="text-xs">Aplicar</Button>
        <Button variant="ghost" onClick={onClear} className="text-xs">Cancelar</Button>
      </div>
    </div>
  );
}
