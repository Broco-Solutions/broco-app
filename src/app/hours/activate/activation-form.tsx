"use client";

import { FormEvent, useState, useTransition } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { activateAccount } from "./actions";

export function ActivationForm({ token, accountName, accountEmail }: { token: string; accountName: string; accountEmail: string }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        await activateAccount(formData);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo activar la cuenta.");
      }
    });
  };

  return <form onSubmit={submit} className="rounded-[1.6rem] border border-slate-200/70 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.10),0_6px_16px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/[0.03] sm:p-8">
    <div className="space-y-4">
      <div className="inline-flex rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">ACTIVACIÓN SEGURA</div>
      <h1 className="font-display text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.02em] text-ink sm:text-[1.9rem]">Activá tu cuenta</h1>
      <p className="text-sm leading-6 text-slate-500">Creá tu contraseña para empezar a usar Broco App.</p>
    </div>
    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-sm font-semibold text-ink">{accountName}</p>
      <p className="mt-0.5 text-xs text-slate-500">{accountEmail}</p>
    </div>
    <div className="space-y-2.5 pt-5">
      <label htmlFor="activation-password" className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">NUEVA CONTRASEÑA</label>
      <div className="relative">
        <Input id="activation-password" name="password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Elegí una contraseña" className="h-11 pr-11" autoComplete="new-password" minLength={12} required />
        <button type="button" className="absolute inset-y-0 right-1 flex w-10 items-center justify-center rounded-md text-slate-500 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>
          {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      <p className="text-xs text-slate-500">Usá al menos 12 caracteres.</p>
    </div>
    {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-brick ring-1 ring-red-100">{error}</p> : null}
    <input type="hidden" name="token" value={token} />
    <Button type="submit" className="mt-5 h-11 w-full text-[15px] font-semibold shadow-[0_8px_20px_rgba(37,99,235,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2" disabled={isPending}>
      <LockKeyhole className="mr-2 h-4 w-4" />{isPending ? "Activando…" : "Activar cuenta"}
    </Button>
  </form>;
}
