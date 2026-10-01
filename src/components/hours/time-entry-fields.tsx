"use client";

import { Input } from "@/components/ui/input";
import { formatTimeMinutes, previewTimeDuration, type TimeDurationUnit } from "@/lib/time-duration";

export function TimeEntryDateField({
  value,
  defaultValue,
  max,
  onChange,
  className,
}: {
  value?: string;
  defaultValue?: string;
  max: string;
  onChange?: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Fecha</span>
      <Input
        name="workDate"
        type="date"
        value={value}
        defaultValue={defaultValue}
        max={max}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className="mt-1"
        required
      />
    </label>
  );
}

export function TimeDurationField({
  duration,
  unit,
  onDurationChange,
  onUnitChange,
}: {
  duration: string;
  unit: TimeDurationUnit;
  onDurationChange: (value: string) => void;
  onUnitChange: (value: TimeDurationUnit) => void;
}) {
  const equivalent = previewTimeDuration(duration, unit);
  return (
    <div className="grid gap-4 md:grid-cols-[1fr,160px]">
      <label>
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Duración</span>
        <Input
          name="duration"
          inputMode="decimal"
          value={duration}
          onChange={(event) => onDurationChange(event.target.value)}
          placeholder={unit === "HOURS" ? "1,5" : "90"}
          className="mt-1"
        />
        <span className="mt-1 block text-xs text-gray-500">Equivalencia: {equivalent ? formatTimeMinutes(equivalent) : "—"}</span>
      </label>
      <label>
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Unidad</span>
        <select
          name="unit"
          value={unit}
          onChange={(event) => onUnitChange(event.target.value as TimeDurationUnit)}
          className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"
        >
          <option value="MINUTES">Minutos</option>
          <option value="HOURS">Horas</option>
        </select>
      </label>
    </div>
  );
}
