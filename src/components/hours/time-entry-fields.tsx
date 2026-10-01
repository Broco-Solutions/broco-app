"use client";

import { Input } from "@/components/ui/input";

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

export function TimeDurationFields({
  hours,
  minutes,
  onHoursChange,
  onMinutesChange,
  className,
}: {
  hours: string;
  minutes: string;
  onHoursChange: (value: string) => void;
  onMinutesChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-2 gap-4 ${className ?? ""}`}>
      <label>
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Horas</span>
        <Input
          name="hours"
          type="number"
          min="0"
          max="24"
          step="1"
          inputMode="numeric"
          value={hours}
          onChange={(event) => onHoursChange(event.target.value)}
          placeholder="0"
          className="mt-1"
        />
      </label>
      <label>
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Minutos</span>
        <Input
          name="minutes"
          type="number"
          min="0"
          max="59"
          step="1"
          inputMode="numeric"
          value={minutes}
          onChange={(event) => onMinutesChange(event.target.value)}
          placeholder="0"
          className="mt-1"
        />
      </label>
    </div>
  );
}
