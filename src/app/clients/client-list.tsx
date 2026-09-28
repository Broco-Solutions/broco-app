"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/data-table";
import { ConfirmActionModal } from "@/components/ui/confirm-action-modal";
import { ClientFormModal } from "@/components/screens/client-form-modal";
import { saveClient, removeClient } from "./actions";

type Client = {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  _count: { projects: number };
};

export function ClientList({ clients: initial }: { clients: Client[] }) {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>(initial);
  const [editing, setEditing] = useState<Client | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [search, setSearch] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => setClients(initial), [initial]);

  const filtered = clients.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.contactName ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.contactEmail ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.contactPhone ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async (data: Record<string, string>) => {
    const fd = new FormData();
    if (editing) fd.set("id", editing.id);
    fd.set("name", data.name);
    fd.set("contactName", data.contactName ?? "");
    fd.set("contactEmail", data.contactEmail ?? "");
    fd.set("contactPhone", data.contactPhone ?? "");
    fd.set("notes", data.notes ?? "");
    const result = await saveClient(null, fd);
    if (!result.success) throw new Error(result.message);
    setShowForm(false);
    setEditing(null);
    router.refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    const fd = new FormData();
    fd.set("id", deleteTarget.id);
    const result = await removeClient(null, fd);
    if (!result.success) {
      setDeleteError(result.message);
      return;
    }
    setDeleteTarget(null);
    router.refresh();
  };

  return (
    <>
      {/* Totalizador, busqueda y boton nuevo */}
      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Total de clientes</span>
          <span className="text-lg font-bold tabular-nums text-gray-900">{filtered.length}</span>
        </div>
        <div className="flex w-full min-w-0 items-center gap-2 sm:max-w-md sm:flex-1">
          <Input
            placeholder="Buscar cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button type="button" className="w-full sm:w-auto" onClick={() => { setEditing(null); setShowForm(true); }}>Nuevo cliente</Button>
      </div>
      {/* DESKTOP TABLE */}
      <div className="hidden md:block">
      <DataTable tableClassName="table-fixed" headers={["Nombre", "Contacto", "Email", "Telefono", "Proyectos", "Acciones"]}
        colGroup={<colgroup><col style={{width:"28%"}} /><col style={{width:"12%"}} /><col style={{width:"14%"}} /><col style={{width:"10%"}} /><col style={{width:"8%"}} /><col style={{width:"28%"}} /></colgroup>}
      >
        {filtered.length === 0 ? (
          <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
            {search ? "No hay clientes que coincidan con la búsqueda." : "Todavía no hay clientes."}
          </td></tr>
        ) : filtered.map((c) => (
          <tr key={c.id}>
            <td className="px-4 py-2.5 align-middle">
              <div className="line-clamp-2 break-words" title={c.name}>
              <Link href={`/clients/${c.id}`} className="text-cobalt underline">
                {c.name}
              </Link>
              </div>
            </td>
            <td className="px-4 py-2.5 align-middle"><div className="line-clamp-2 break-words" title={c.contactName ?? ""}>{c.contactName ?? "—"}</div></td>
            <td className="px-4 py-2.5 text-sm break-all" title={c.contactEmail ?? ""}>{c.contactEmail ?? "—"}</td>
            <td className="px-4 py-2.5 whitespace-nowrap text-sm">{c.contactPhone ?? "—"}</td>
            <td className="px-4 py-2.5 text-center text-sm">{c._count.projects}</td>
            <td className="px-4 py-2.5 space-x-2 whitespace-nowrap">
              <Button variant="secondary" className="text-xs" onClick={() => { setEditing(c); setShowForm(true); }}>
                Editar
              </Button>
              <Button variant="secondary" className="text-xs text-brick" onClick={() => setDeleteTarget(c)}>
                Eliminar
              </Button>
            </td>
          </tr>
        ))}
      </DataTable>
      </div>

      {/* MOBILE CARDS */}
      <div className="space-y-2 md:hidden">
        {filtered.map((c) => (
          <div key={c.id} className="rounded-lg border border-gray-200 bg-white p-3 space-y-1.5">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <Link href={`/clients/${c.id}`} className="min-w-0 break-words font-medium text-sm text-cobalt underline">{c.name}</Link>
              <span className="text-xs text-gray-500">{c._count.projects} proy.</span>
            </div>
            <div className="text-xs text-gray-400 space-y-0.5">
              {c.contactName && <div>Contacto: {c.contactName}</div>}
              {c.contactEmail && <div className="break-all">{c.contactEmail}</div>}
              {c.contactPhone && <div>{c.contactPhone}</div>}
            </div>
            <div className="flex gap-1 pt-1">
              <Button variant="secondary" className="text-xs flex-1" onClick={() => { setEditing(c); setShowForm(true); }}>Editar</Button>
              <Button variant="secondary" className="text-xs flex-1 text-brick" onClick={() => setDeleteTarget(c)}>Eliminar</Button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">
            {search ? "No hay clientes que coincidan con la búsqueda." : "Todavía no hay clientes."}
          </p>
        )}
      </div>

      <ClientFormModal
        open={showForm}
        title={editing ? "Editar cliente" : "Nuevo cliente"}
        initial={editing ? {
          name: editing.name,
          contactName: editing.contactName ?? "",
          contactEmail: editing.contactEmail ?? "",
          contactPhone: editing.contactPhone ?? "",
        } : undefined}
        onClose={() => { setShowForm(false); setEditing(null); }}
        onSave={handleSave}
      />

      <ConfirmActionModal
        open={!!deleteTarget}
        title="Eliminar cliente"
        description={`¿Eliminar "${deleteTarget?.name}"? Esta accion no se puede deshacer.`}
        confirmLabel="Eliminar"
        isPending={false}
        error={deleteError}
        onClose={() => { setDeleteTarget(null); setDeleteError(null); }}
        onConfirm={handleDelete}
      />
    </>
  );
}
