import { requireRole } from "@/lib/auth";
import { prisma } from "@/server/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { saveUser, toggleUser } from "./actions";
import { ActivationLinkControl } from "./activation-link-control";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requireRole("ADMIN");
  const users = await prisma.appUser.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true, role: true, isActive: true } });
  return <div className="space-y-6">
    <PageHeader eyebrow="Administración" title="Usuarios" description="Administrá las cuentas individuales y el acceso a Broco App." meta={null} />
    <Card>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Agregar usuario</h2>
      <form action={saveUser} className="grid gap-3 md:grid-cols-4">
        <input name="name" required placeholder="Nombre" aria-label="Nombre" className="h-10 rounded-lg border border-gray-200 px-3 text-sm" />
        <input name="email" required type="email" placeholder="Correo" aria-label="Correo" className="h-10 rounded-lg border border-gray-200 px-3 text-sm" />
        <select name="role" aria-label="Rol" className="h-10 rounded-lg border border-gray-200 px-3 text-sm"><option value="COLLABORATOR">Colaborador</option><option value="ADMIN">Administrador</option></select>
        <Button type="submit">Agregar usuario</Button>
      </form>
      <p className="mt-3 text-xs text-gray-500">La cuenta se crea inactiva. Luego generá un enlace seguro para que la persona active su acceso.</p>
    </Card>
    <div className="grid gap-4">
      {users.map((user) => <Card key={user.id}>
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><h2 className="break-words font-semibold">{user.name}</h2><p className="break-words text-sm text-gray-500">{user.email} · {user.role === "ADMIN" ? "Administrador" : "Colaborador"}</p><p className="mt-1 text-xs font-medium text-gray-500">{user.isActive ? "Activo" : "Inactivo / pendiente de activación"}</p></div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {user.isActive ? <form action={toggleUser}><input type="hidden" name="id" value={user.id} /><input type="hidden" name="active" value="true" /><Button variant="secondary" type="submit">Desactivar</Button></form> : null}
          </div>
        </div>
        {!user.isActive ? <ActivationLinkControl userId={user.id} userName={user.name} /> : null}
        <details className="mt-4"><summary className="cursor-pointer text-sm font-medium text-brand">Editar datos de cuenta</summary><form action={saveUser} className="mt-3 grid min-w-0 gap-3 md:grid-cols-4"><input type="hidden" name="id" value={user.id} /><input name="name" required defaultValue={user.name} aria-label={`Nombre de ${user.name}`} className="h-10 min-w-0 w-full rounded-lg border border-gray-200 px-3 text-sm" /><input name="email" required type="email" defaultValue={user.email} aria-label={`Correo de ${user.name}`} className="h-10 min-w-0 w-full rounded-lg border border-gray-200 px-3 text-sm" /><select name="role" defaultValue={user.role} aria-label={`Rol de ${user.name}`} className="h-10 min-w-0 w-full rounded-lg border border-gray-200 px-3 text-sm"><option value="COLLABORATOR">Colaborador</option><option value="ADMIN">Administrador</option></select><Button type="submit" className="w-full md:w-auto">Guardar cambios</Button></form></details>
      </Card>)}
    </div>
  </div>;
}
