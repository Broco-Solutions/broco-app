"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

type SearchableSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Seleccionar",
  disabled = false,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => options.find((o) => o.id === value), [options, value]);

  const filtered = useMemo(
    () => (query ? options.filter((o) => o.name.toLowerCase().includes(query.toLowerCase())) : options),
    [options, query],
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
    if (!open) setQuery("");
  }, [open]);

  const handleToggle = () => {
    if (!disabled) setOpen((prev) => !prev);
  };

  const handleSelect = (opt: Option) => {
    onChange(opt.id);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={selected ? undefined : placeholder}
        className={cn(
          "h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-left flex items-center justify-between gap-2",
          "outline-none focus:border-brand focus:ring-1 focus:ring-brand",
          "disabled:cursor-not-allowed disabled:opacity-50",
          !value && "text-gray-400",
        )}
      >
        <span className="truncate">{selected ? selected.name : placeholder}</span>
        <svg className={cn("h-4 w-4 shrink-0 text-gray-400 transition", open && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar…"
            className="w-full border-b border-gray-200 px-3 py-2 text-sm outline-none placeholder:text-gray-400"
          />
          <div className="max-h-48 overflow-y-auto" role="listbox">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-400">Sin resultados.</div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={opt.id === value}
                  onClick={() => handleSelect(opt)}
                  className={cn(
                    "w-full px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors",
                    opt.id === value && "bg-brand/10 font-medium text-brand",
                  )}
                >
                  {opt.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
