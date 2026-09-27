"use client";

import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ModalPortal } from "@/components/ui/modal-portal";

export function ConfirmActionModal({
  open,
  title,
  description,
  confirmLabel,
  isPending,
  disabled = false,
  error,
  onClose,
  onConfirm,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  isPending: boolean;
  disabled?: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[90] overflow-y-auto px-4 py-6 sm:py-8">
        <button
          aria-label="Cerrar modal"
          className="fixed inset-0 bg-ink/45 backdrop-blur-sm"
          onClick={onClose}
          type="button"
        />
        <div className="relative flex min-h-full items-start justify-center sm:items-center">
          <div className="relative w-full max-w-xl" role="dialog" aria-modal="true" aria-labelledby="confirm-action-title" aria-describedby="confirm-action-description">
            <Card className="border border-black/10 bg-[linear-gradient(180deg,rgba(255,250,249,0.98),rgba(255,244,240,0.96))] p-0 shadow-[0_24px_80px_rgba(16,21,34,0.18)]">
              <div className="flex max-h-[calc(100vh-3rem)] flex-col">
                <div className="flex-1 space-y-5 overflow-y-auto p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-brick">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Confirmación requerida
                      </div>
                      <h3 id="confirm-action-title" className="mt-2 font-display text-3xl text-ink">{title}</h3>
                      <p id="confirm-action-description" className="mt-2 max-w-lg text-sm text-ink/65">{description}</p>
                    </div>
                    <button
                      aria-label="Cerrar modal"
                      className="rounded-full border border-black/10 bg-white/90 p-2 text-ink/70 transition hover:bg-black/5 hover:text-ink"
                      onClick={onClose}
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {children ? <div className="rounded-[1.2rem] border border-black/8 bg-white/80 p-4">{children}</div> : null}
                  {error ? <p role="alert" className="text-sm text-brick">{error}</p> : null}
                </div>

                <div className="flex flex-wrap justify-end gap-3 border-t border-black/8 bg-white/92 px-6 py-4 backdrop-blur-sm">
                  <Button type="button" variant="ghost" onClick={onClose}>
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    className="bg-brick text-white hover:bg-brick/90"
                    disabled={isPending || disabled}
                    onClick={onConfirm}
                  >
                    {isPending ? "Procesando…" : confirmLabel}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
