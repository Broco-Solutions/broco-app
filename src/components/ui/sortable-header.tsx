import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export function SortableHeader<Key extends string>({
  label,
  sortKey,
  sort,
  defaultDirection,
  onSort,
}: {
  label: string;
  sortKey: Key;
  sort: "auto" | `${Key}-asc` | `${Key}-desc`;
  defaultDirection?: "asc" | "desc";
  onSort: (key: Key) => void;
}) {
  const explicitDirection = sort === `${sortKey}-asc` ? "asc" : sort === `${sortKey}-desc` ? "desc" : null;
  const direction = explicitDirection ?? (sort === "auto" ? defaultDirection : undefined);
  const isActive = explicitDirection !== null;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`Ordenar por ${label}: ${direction === "asc" ? "ascendente" : direction === "desc" ? "descendente" : "sin orden"}`}
      className={`inline-flex min-h-6 w-full items-center gap-1 text-left text-[11px] font-semibold uppercase tracking-[0.16em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper/70 ${isActive ? "text-paper" : "text-paper/85"}`}
    >
      <span>{label}</span>
      {direction === "asc" ? <ArrowUp aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> : direction === "desc" ? <ArrowDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> : <ArrowUpDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 opacity-70" />}
    </button>
  );
}
