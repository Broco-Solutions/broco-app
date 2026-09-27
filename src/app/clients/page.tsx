import { PageHeader } from "@/components/ui/page-header";
import { listClients } from "@/server/services/clients";
import { ClientList } from "./client-list";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  await requireRole("ADMIN");
  let clients;
  try {
    clients = await listClients();
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Clientes" title="Clientes" description="" meta={null} />
        <p className="text-ink/50">Error al cargar clientes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Clientes" title="Clientes" description="" meta={null} />
      <ClientList clients={JSON.parse(JSON.stringify(clients))} />
    </div>
  );
}
