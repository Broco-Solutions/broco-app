import { cn } from "@/lib/utils";

export function DataTableActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-1.5", className)}>
      {children}
    </div>
  );
}

export function DataTable({
  headers,
  children,
  className,
  footer,
  tableClassName,
  colGroup,
  scrollable = true,
}: {
  headers: React.ReactNode[];
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
  tableClassName?: string;
  colGroup?: React.ReactNode;
  scrollable?: boolean;
}) {
  return (
    <div className={cn("w-full overflow-hidden rounded-lg border border-black/10", className)}>
      <div className={scrollable ? "overflow-x-auto overscroll-x-contain" : "overflow-x-hidden"}>
        <table className={cn("w-full divide-y divide-black/10 text-left text-sm", tableClassName)}>
          {colGroup}
          <thead className="bg-ink text-paper">
            <tr>
              {headers.map((header, idx) => (
                <th
                  key={typeof header === "string" ? header : `h-${idx}`}
                  scope="col"
                  className={cn(
                    "px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em]",
                  )}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 bg-white/90">{children}</tbody>
          {footer ? <tfoot className="border-t border-black/10 bg-stone-50/95">{footer}</tfoot> : null}
        </table>
      </div>
    </div>
  );
}
