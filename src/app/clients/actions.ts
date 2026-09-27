"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient, updateClient, deleteClient as deleteClientSvc, clientSchema } from "@/server/services/clients";

type ActionResult = { success: true } | { success: false; message: string };

async function requireAuth() {
  await requireRole("ADMIN");
}

export async function saveClient(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAuth();
    const data = clientSchema.parse({
      name: formData.get("name"),
      contactName: formData.get("contactName") || null,
      contactEmail: formData.get("contactEmail") || null,
      contactPhone: formData.get("contactPhone") || null,
      notes: formData.get("notes") || null,
    });

    const id = formData.get("id") as string | null;
    if (id) {
      await updateClient(id, data);
    } else {
      await createClient(data);
    }
    revalidatePath("/clients");
    revalidatePath("/projects");
    revalidatePath("/clients/[id]");
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al guardar." };
  }
}

export async function removeClient(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAuth();
    await deleteClientSvc(formData.get("id") as string);
    revalidatePath("/clients");
    revalidatePath("/projects");
    revalidatePath("/clients/[id]");
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Error al eliminar." };
  }
}
