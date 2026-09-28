import { getUsableActivationAccount } from "@/server/access-tokens";
import { BrandLogo } from "@/components/layout/brand-logo";
import { ActivationForm } from "./activation-form";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function ActivatePage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token ?? "";
  const account = await getUsableActivationAccount(token);
  return <div className="relative min-h-screen overflow-hidden bg-slate-50">
    <div className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50 to-blue-50" />
      <div className="absolute inset-0 bg-gradient-to-tr from-cobalt/[0.07] via-transparent to-blue-200/30" />
      <div className="absolute -right-24 -top-24 h-[460px] w-[460px] rounded-full bg-blue-200/40 blur-[90px]" />
      <div className="absolute -left-32 bottom-0 h-[420px] w-[420px] rounded-full bg-cobalt/12 blur-[90px]" />
    </div>
    <main className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col items-center justify-center px-5 py-8 sm:px-6">
      <BrandLogo className="w-full max-w-[200px]" priority />
      <div className="mt-5 w-full">
        {account ? <ActivationForm token={token} accountName={account.name} accountEmail={account.email} /> : <div className="rounded-[1.6rem] border border-slate-200/70 bg-white p-6 text-center shadow-[0_18px_48px_rgba(15,23,42,0.10),0_6px_16px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/[0.03] sm:p-8"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-brick"><span aria-hidden>!</span></div><h1 className="mt-4 font-display text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.02em] text-ink">Este enlace ya no es válido</h1><p className="mt-3 text-sm leading-6 text-slate-500">Puede haber vencido o haber sido utilizado. Pedile a un administrador que genere un enlace nuevo.</p><Link href="/login" className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand px-4 text-[15px] font-semibold text-white shadow-[0_8px_20px_rgba(37,99,235,0.25)] transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">Volver al inicio de sesión</Link></div>}
      </div>
      <p className="mt-5 text-center text-xs leading-4 text-slate-400">Enlace seguro · válido por 24 horas</p>
    </main>
  </div>;
}
