"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ProjectFormModal } from "@/app/projects/project-form-modal";
import { saveProject } from "@/app/projects/actions";
import { formatUsd } from "@/lib/utils";

type ProjectTotals = {
  incAll?: number; incPaid?: number; incPending?: number;
  expAll?: number; expPaid?: number; expPending?: number;
};

type Project = {
  id: string;
  name: string;
  isActive: boolean;
  startDate: string | Date | null;
  endDate: string | Date | null;
  _count?: { incomes: number; expenses: number };
} & ProjectTotals;

type ClientOption = { id: string; name: string };

type Totals = { all: number; paid: number; pending: number; allArs: number; paidArs: number; pendingArs: number };

export function ClientProjectsSection({
  clientId,
  projects: initialProjects,
  clients,
  incomeTotals,
  expenseTotals,
}: {
  clientId: string;
  projects: Project[];
  clients: ClientOption[];
  incomeTotals?: Totals;
  expenseTotals?: Totals;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => setProjects(initialProjects), [initialProjects]);

  const handleSave = async (data: Record<string, unknown>) => {
    const fd = new FormData();
    fd.set("clientId", data.clientId as string);
    fd.set("name", data.name as string);
    fd.set("isActive", data.isActive ? "true" : "false");
    if (data.startDate) fd.set("startDate", data.startDate as string);
    if (data.endDate) fd.set("endDate", data.endDate as string);
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
    router.refresh();
  };

  const hasTotals = incomeTotals || expenseTotals;

  return (
    <>
      {hasTotals && (
        <Card className="mb-6">
          <h3 className="font-display text-lg text-ink">Total del cliente</h3>
          <div className="mt-3 space-y-3 text-sm">
            {incomeTotals && (
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="font-medium text-ink">Ingresos</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/60">
                  <span>Total: <span className="font-semibold text-ink">{formatUsd(incomeTotals.all)}</span></span>
                  <span>Cobrado: <span className="font-semibold text-emerald-600">{formatUsd(incomeTotals.paid)}</span></span>
                  <span>Pendiente: <span className="font-semibold text-amber-600">{formatUsd(incomeTotals.pending)}</span></span>
                </div>
              </div>
            )}
            {expenseTotals && (
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="font-medium text-ink">Gastos</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/60">
                  <span>Total: <span className="font-semibold text-ink">{formatUsd(expenseTotals.all)}</span></span>
                  <span>Pagado: <span className="font-semibold text-emerald-600">{formatUsd(expenseTotals.paid)}</span></span>
                  <span>Pendiente: <span className="font-semibold text-amber-600">{formatUsd(expenseTotals.pending)}</span></span>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl text-ink">
          Proyectos ({projects.length})
        </h2>
        <Button type="button" onClick={() => setShowForm(true)}>Nuevo proyecto</Button>
      </div>
      {projects.length === 0 ? (
        <p className="mt-4 text-ink/50">Sin proyectos.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {projects.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-black/10 p-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <Link
                    href={`/projects/${p.id}`}
                    className="font-medium text-cobalt underline"
                  >
                    {p.name}
                  </Link>
                  <div className="text-xs text-ink/50">
                    {p.isActive ? "Activo" : "Inactivo"}
                    {p.startDate && ` · Inicio: ${new Date(p.startDate).toLocaleDateString("es-AR")}`}
                    {p.endDate && ` · Fin: ${new Date(p.endDate).toLocaleDateString("es-AR")}`}
                  </div>
                </div>
                <Badge tone={p.isActive ? "success" : "neutral"}>
                  {p.isActive ? "Activo" : "Inactivo"}
                </Badge>
              </div>
              {/* Per-project totals */}
              {(p.incAll != null || p.expAll != null) && ((p.incAll ?? 0) + (p.incPaid ?? 0) + (p.incPending ?? 0) + (p.expAll ?? 0) + (p.expPaid ?? 0) + (p.expPending ?? 0) > 0) && (
                <div className="mt-2 space-y-0.5 border-t border-gray-100 pt-2 text-xs text-ink/50">
                  {p.incAll != null && (p.incAll > 0 || (p.incPaid ?? 0) > 0 || (p.incPending ?? 0) > 0) && (
                    <div>
                      <span className="font-medium text-ink/70">Ingresos:</span>{" "}
                      USD {formatUsd(p.incAll ?? 0)} total
                      {(p.incPaid ?? 0) > 0 && <span className="text-emerald-600"> · Cobrado {formatUsd(p.incPaid ?? 0)}</span>}
                      {(p.incPending ?? 0) > 0 && <span className="text-amber-600"> · Pendiente {formatUsd(p.incPending ?? 0)}</span>}
                    </div>
                  )}
                  {p.expAll != null && (p.expAll > 0 || (p.expPaid ?? 0) > 0 || (p.expPending ?? 0) > 0) && (
                    <div>
                      <span className="font-medium text-ink/70">Gastos:</span>{" "}
                      USD {formatUsd(p.expAll ?? 0)} total
                      {(p.expPaid ?? 0) > 0 && <span className="text-emerald-600"> · Pagado {formatUsd(p.expPaid ?? 0)}</span>}
                      {(p.expPending ?? 0) > 0 && <span className="text-amber-600"> · Pendiente {formatUsd(p.expPending ?? 0)}</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ProjectFormModal
        open={showForm}
        title="Nuevo proyecto"
        initial={{ clientId }}
        onClose={() => setShowForm(false)}
        onSave={handleSave}
        clients={clients}
      />
    </>
  );
}
