"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalPortal } from "@/components/ui/modal-portal";
import { ConfirmActionModal } from "@/components/ui/confirm-action-modal";
import {
  configureAccessAction,
  revealPasswordAction,
  changePasswordAction,
  deactivateAccessAction,
  activateAccessAction,
} from "@/app/projects/planning-actions";

type ShareAccess = { slug: string; revokedAt: string | null } | null;

function buildShareUrl(slug: string): string {
  if (typeof window === "undefined") return `/p/${slug}`;
  return `${window.location.origin}/p/${slug}`;
}

export function ProjectAccessPanel({
  projectId,
  initialAccess,
}: {
  projectId: string;
  initialAccess: ShareAccess;
}) {
  const router = useRouter();
  const [access, setAccess] = useState<ShareAccess>(initialAccess);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);

  const isActive = access !== null && access.revokedAt === null;
  const isDeactivated = access !== null && access.revokedAt !== null;

  const shareUrl = access ? buildShareUrl(access.slug) : "";

  const handleConfigure = async () => {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("projectId", projectId);
    const result = await configureAccessAction(null, fd);
    setBusy(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    // result contains slug and password
    const res = result as { success: true; slug: string; password: string };
    setAccess({ slug: res.slug, revokedAt: null });
    setRevealedPassword(res.password);
    setIsRevealed(true);
    setCopiedLink(false);
    setCopiedPassword(false);
    router.refresh();
  };

  const handleReveal = async () => {
    if (isRevealed && revealedPassword) {
      setIsRevealed(false);
      return;
    }
    if (revealedPassword) {
      setIsRevealed(true);
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("projectId", projectId);
    const result = await revealPasswordAction(null, fd);
    setBusy(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    const res = result as { success: true; password: string };
    setRevealedPassword(res.password);
    setIsRevealed(true);
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyPassword = async () => {
    let pwd = revealedPassword;
    if (!pwd) {
      setBusy(true);
      const fd = new FormData();
      fd.set("projectId", projectId);
      const result = await revealPasswordAction(null, fd);
      setBusy(false);
      if (!result.success) {
        setError(result.message);
        return;
      }
      const res = result as { success: true; password: string };
      pwd = res.password;
      setRevealedPassword(pwd);
      setIsRevealed(true);
    }
    await navigator.clipboard.writeText(pwd);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2000);
  };

  const handleDeactivate = async () => {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("projectId", projectId);
    const result = await deactivateAccessAction(null, fd);
    setBusy(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setShowDeactivateConfirm(false);
    // keep slug, mark as revoked
    if (access) setAccess({ ...access, revokedAt: new Date().toISOString() });
    router.refresh();
  };

  const handleActivate = async () => {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("projectId", projectId);
    const result = await activateAccessAction(null, fd);
    setBusy(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    if (access) setAccess({ ...access, revokedAt: null });
    router.refresh();
  };

  const handleChangePassword = async (newPassword: string | undefined) => {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("projectId", projectId);
    if (newPassword) fd.set("password", newPassword);
    const result = await changePasswordAction(null, fd);
    setBusy(false);
    if (!result.success) {
      setError(result.message);
      throw new Error(result.message);
    }
    const res = result as { success: true; password: string };
    setRevealedPassword(res.password);
    setIsRevealed(true);
    setCopiedPassword(false);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-brick">{error}</p>}

      {!access && (
        <div className="space-y-3">
          <p className="text-sm text-ink/60">
            Permití compartir el seguimiento de este proyecto mediante un enlace privado protegido
            con contraseña.
          </p>
          <Button onClick={handleConfigure} disabled={busy}>
            {busy ? "Configurando..." : "Configurar acceso"}
          </Button>
        </div>
      )}

      {access && (
        <>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Enlace</p>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 break-all rounded bg-gray-50 px-2 py-1.5 text-xs text-cobalt underline decoration-cobalt/30 underline-offset-2 hover:decoration-cobalt"
              >
                {shareUrl}
              </a>
              <Button variant="secondary" onClick={handleCopyLink} className="shrink-0">
                {copiedLink ? "¡Copiado!" : "Copiar enlace"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Contraseña</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="flex-1 break-all rounded bg-gray-50 px-2 py-1.5 text-xs text-ink">
                {isRevealed && revealedPassword ? revealedPassword : "••••••••••••"}
              </code>
              <Button variant="secondary" onClick={handleReveal} disabled={busy} className="shrink-0">
                {isRevealed ? "Ocultar" : "Ver"}
              </Button>
              <Button variant="secondary" onClick={handleCopyPassword} disabled={busy} className="shrink-0">
                {copiedPassword ? "¡Copiado!" : "Copiar"}
              </Button>
              <Button variant="secondary" onClick={() => setShowChangeModal(true)} className="shrink-0">
                Cambiar
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Estado</p>
            {isActive ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm text-ink">
                  <span className="h-2 w-2 rounded-full bg-green-500" /> Activo
                </span>
                <Button
                  variant="ghost"
                  className="text-brick"
                  onClick={() => setShowDeactivateConfirm(true)}
                  disabled={busy}
                >
                  Desactivar acceso
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm text-ink">
                  <span className="h-2 w-2 rounded-full bg-gray-400" /> Acceso desactivado
                </span>
                <Button variant="secondary" onClick={handleActivate} disabled={busy}>
                  Activar acceso
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      <ChangePasswordModal
        open={showChangeModal}
        onClose={() => setShowChangeModal(false)}
        onSave={handleChangePassword}
      />

      <ConfirmActionModal
        open={showDeactivateConfirm}
        title="Desactivar acceso"
        description="El cliente ya no podrá acceder con este enlace. Podrás reactivarlo más tarde sin cambiar la contraseña."
        confirmLabel="Desactivar"
        isPending={busy}
        error={null}
        onClose={() => setShowDeactivateConfirm(false)}
        onConfirm={handleDeactivate}
      />
    </div>
  );
}

function ChangePasswordModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (password: string | undefined) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleGenerate = () => {
    setPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave(password.trim() || undefined);
      setPassword("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[90] overflow-y-auto px-4 py-6">
        <button
          aria-label="Cerrar"
          className="fixed inset-0 bg-ink/45 backdrop-blur-sm"
          onClick={onClose}
          type="button"
        />
        <div className="relative flex min-h-full items-start justify-center sm:items-center">
          <div className="w-full max-w-lg rounded-[1.5rem] bg-white p-6 shadow-[0_24px_80px_rgba(16,21,34,0.18)]">
            <h2 className="font-display text-2xl text-ink">Cambiar contraseña</h2>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-ink">Nueva contraseña</label>
                <Input
                  placeholder="Mínimo 6 caracteres (letra y número)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button type="button" variant="ghost" onClick={handleGenerate} className="text-xs">
                  Generar automáticamente
                </Button>
                <p className="text-xs text-ink/50">Dejá vacío para generar automáticamente una contraseña segura.</p>
              </div>
              {error && <p className="text-sm text-brick">{error}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
