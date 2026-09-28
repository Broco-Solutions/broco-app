"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createActivationLink } from "./actions";

export function ActivationLinkControl({ userId, userName }: { userId: string; userName: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const generate = () => {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("userId", userId);
        const result = await createActivationLink(formData);
        if (!result.success) throw new Error(result.message);
        setLink(new URL(result.path, window.location.origin).toString());
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo generar el enlace.");
      }
    });
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = link;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("copy failed");
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setError("No se pudo copiar automáticamente. Seleccioná el enlace y copialo manualmente.");
    }
  };

  return (
    <div className="basis-full rounded-xl border border-brand/20 bg-brand-50/70 p-4 sm:p-5">
      {link ? (
        <>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white"><Link2 className="h-4 w-4" aria-hidden /></div>
            <div><h3 className="text-sm font-semibold text-gray-900">Enlace de activación</h3><p className="mt-0.5 text-xs text-gray-600">Listo para compartir · vence en 24 horas.</p></div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button type="button" onClick={copyLink} className="w-full sm:w-auto">
              {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
              {copied ? "Enlace copiado" : "Copiar enlace"}
            </Button>
            <Button type="button" variant="secondary" onClick={generate} disabled={isPending} className="w-full sm:w-auto">
              {isPending ? "Generando…" : "Generar nuevo enlace"}
            </Button>
          </div>
          <p className="mt-3 text-xs text-gray-500">Al generar uno nuevo, el enlace anterior deja de ser válido.</p>
          <details className="mt-2 text-xs text-gray-500"><summary className="cursor-pointer hover:text-gray-700">Ver enlace</summary><input aria-label={`Enlace de activación de ${userName}`} readOnly value={link} onFocus={(event) => event.currentTarget.select()} className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600" /></details>
        </>
      ) : (
        <>
          <h3 className="text-sm font-semibold text-gray-900">Acceso pendiente</h3>
          <p className="mt-1 text-sm leading-6 text-gray-600">{userName} todavía no activó su cuenta. Generá un enlace para que defina su contraseña.</p>
          <Button type="button" onClick={generate} disabled={isPending} className="mt-4 w-full sm:w-auto">
            <Link2 className="mr-1.5 h-4 w-4" />
            {isPending ? "Generando…" : "Generar enlace de activación"}
          </Button>
        </>
      )}
      {error ? <p role="alert" className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
