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
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError("No se pudo copiar automáticamente. Seleccioná el enlace y copialo manualmente.");
    }
  };

  return (
    <div className="basis-full rounded-lg border border-brand/20 bg-brand/5 p-3">
      <p className="text-xs text-gray-600">Enlace para que {userName} active su cuenta y defina su contraseña. Vence en 24 horas y generar uno nuevo invalida el anterior.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="ghost" onClick={generate} disabled={isPending}>
          <Link2 className="mr-1.5 h-4 w-4" />
          {isPending ? "Generando…" : link ? "Generar nuevo enlace" : "Generar enlace seguro"}
        </Button>
        {link ? (
          <>
            <input aria-label={`Enlace de activación de ${userName}`} readOnly value={link} onFocus={(event) => event.currentTarget.select()} className="min-w-[16rem] flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600" />
            <Button type="button" variant="secondary" onClick={copyLink}>
              {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
              {copied ? "Copiado" : "Copiar enlace"}
            </Button>
          </>
        ) : null}
      </div>
      {error ? <p role="alert" className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
