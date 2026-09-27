"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "next-auth/react";
import { safeInternalRedirect } from "@/lib/safe-redirect";
import { Eye, EyeOff } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      try {
        setError(null);
        const result = await signIn("credentials", { email, password, redirect: false });
        if (!result || result.error) throw new Error("Correo o contraseña incorrectos.");
        router.push(safeInternalRedirect(searchParams.get("redirectTo")));
        router.refresh();
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "No se pudo iniciar sesión.");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-[1.6rem] border border-slate-200/70 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.10),0_6px_16px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/[0.03] sm:p-8">
      <div className="space-y-4">
        <div className="inline-flex rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">ACCESO INTERNO</div>
        <h1 className="font-display text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.02em] text-ink sm:text-[1.9rem]">Ingresá a Broco</h1>
        <p className="text-sm leading-6 text-slate-500">Ingresá con tu cuenta individual.</p>
      </div>
      <div className="space-y-2.5 pt-5">
        <label htmlFor="email" className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">CORREO</label>
        <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@brocosolutions.com" className="h-11" autoComplete="email" />
        <label htmlFor="password" className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">CONTRASEÑA</label>
        <div className="relative">
          <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Ingresá tu contraseña" className="h-11 pr-11" autoComplete="current-password" />
          <button type="button" className="absolute inset-y-0 right-1 flex w-10 items-center justify-center rounded-md text-slate-500 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>
            {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>
      {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-brick ring-1 ring-red-100">{error}</p> : null}
      <Button type="submit" className="mt-1 h-11 w-full text-[15px] font-semibold shadow-[0_8px_20px_rgba(37,99,235,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2" disabled={isPending}>
        {isPending ? "Validando…" : "Ingresar"}
      </Button>
    </form>
  );
}
