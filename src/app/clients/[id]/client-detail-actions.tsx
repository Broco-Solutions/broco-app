"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ClientFormModal } from "@/components/screens/client-form-modal";
import { saveClient } from "../actions";
import { useState } from "react";

type ClientData = {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
};

const contextLinkClass = "inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50";

export function ClientDetailActions({ client }: { client: ClientData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleSave = async (data: Record<string, string>) => {
    const formData = new FormData();
    formData.set("id", client.id);
    formData.set("name", data.name);
    formData.set("contactName", data.contactName ?? "");
    formData.set("contactEmail", data.contactEmail ?? "");
    formData.set("contactPhone", data.contactPhone ?? "");
    formData.set("notes", data.notes ?? "");
    const result = await saveClient(null, formData);
    if (!result.success) throw new Error(result.message);
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => setOpen(true)}>Editar cliente</Button>
        <Link href={`/projects?client=${client.id}`} className={contextLinkClass}>Ver proyectos</Link>
        <Link href={`/incomes?client=${client.id}`} className={contextLinkClass}>Ver ingresos</Link>
        <Link href={`/expenses?client=${client.id}`} className={contextLinkClass}>Ver gastos</Link>
      </div>
      <ClientFormModal
        open={open}
        title="Editar cliente"
        initial={{
          name: client.name,
          contactName: client.contactName ?? "",
          contactEmail: client.contactEmail ?? "",
          contactPhone: client.contactPhone ?? "",
          notes: client.notes ?? "",
        }}
        onClose={() => setOpen(false)}
        onSave={handleSave}
      />
    </>
  );
}
