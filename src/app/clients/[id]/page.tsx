import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getClient } from "@/server/services/clients";
import { listClients } from "@/server/services/clients";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ClientProjectsSection } from "./client-projects-section";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("ADMIN");
  let client;
  try {
    client = await getClient(params.id);
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Cliente" title="No encontrado" description="" meta={null} />
      </div>
    );
  }

  const allClients = await listClients().catch(() => []);

  const safe = JSON.parse(JSON.stringify(client));
  const safeClients = JSON.parse(JSON.stringify(allClients.map((c) => ({ id: c.id, name: c.name }))));
  const safeProjects = JSON.parse(JSON.stringify(safe.projects));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Cliente"
        title={safe.name}
        description=""
        meta={
          <Badge tone="neutral">
            {safe._count.projects} proyecto{safe._count.projects !== 1 ? "s" : ""}
          </Badge>
        }
      />

      <Card>
        <h2 className="font-display text-xl text-ink">Datos de contacto</h2>
        <div className="mt-4 space-y-2 text-sm">
          <p><span className="text-ink/50">Contacto:</span> {safe.contactName ?? "—"}</p>
          <p><span className="text-ink/50">Email:</span> {safe.contactEmail ?? "—"}</p>
          <p><span className="text-ink/50">Telefono:</span> {safe.contactPhone ?? "—"}</p>
          <p><span className="text-ink/50">Notas:</span> {safe.notes ?? "—"}</p>
          <p className="text-ink/30 text-xs">
            Creado: {new Date(safe.createdAt).toLocaleDateString("es-AR")} ·
            Actualizado: {new Date(safe.updatedAt).toLocaleDateString("es-AR")}
          </p>
        </div>
      </Card>

      <Card>
        <ClientProjectsSection
          clientId={safe.id}
          projects={safeProjects}
          clients={safeClients}
          incomeTotals={safe._incomeTotals}
          expenseTotals={safe._expenseTotals}
        />
      </Card>
    </div>
  );
}
