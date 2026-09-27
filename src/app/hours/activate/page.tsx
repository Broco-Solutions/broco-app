import { activateAccount } from "./actions";
import { getUsableActivationAccount } from "@/server/access-tokens";
export const dynamic = "force-dynamic";
export default async function ActivatePage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token ?? "";
  const account = await getUsableActivationAccount(token);
  return <main className="mx-auto flex min-h-screen max-w-md items-center px-4"><form action={activateAccount} className="w-full space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"><h1 className="text-xl font-semibold">Activar cuenta</h1>{account ? <div className="rounded-lg bg-gray-50 px-3 py-2"><p className="text-sm font-semibold text-gray-900">{account.name}</p><p className="text-xs text-gray-500">{account.email}</p></div> : <p className="text-sm text-red-600">Este enlace no es válido o ya venció.</p>}<p className="text-sm text-gray-500">Elegí una contraseña de al menos 12 caracteres. El enlace es de un solo uso y vence en 24 horas.</p><input type="hidden" name="token" value={token} /><input name="password" type="password" minLength={12} required autoComplete="new-password" disabled={!account} className="h-11 w-full rounded-lg border border-gray-200 px-3 disabled:bg-gray-100" placeholder="Nueva contraseña" /><button disabled={!account} className="h-11 w-full rounded-lg bg-brand px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Activar cuenta</button></form></main>;
}
