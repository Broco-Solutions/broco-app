"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { signOut } from "next-auth/react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { navigationItems } from "@/components/layout/navigation-config";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Header({ role }: { role?: "ADMIN" | "COLLABORATOR" }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => { setMobileMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileMenuOpen(false); };
    window.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", esc); };
  }, [mobileMenuOpen]);

  const logout = () => { startTransition(async () => { await signOut({ redirect: false }); router.push("/login"); router.refresh(); }); };

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-2.5 md:px-6">
          <div className="text-sm font-semibold text-gray-700 lg:hidden"><Link href="/"><BrandLogo className="max-w-[120px]" priority /></Link></div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={logout} disabled={isPending} className="hidden lg:flex text-sm">
              <LogOut className="mr-1.5 h-4 w-4" /> Salir
            </Button>
            <button
              aria-label="Menu" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white lg:hidden"
              onClick={() => setMobileMenuOpen((c) => !c)} type="button"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute inset-x-3 top-14 max-h-[80vh] overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
            <nav className="space-y-1">
              {navigationItems.filter((item) => role === "ADMIN" || item.href === "/hours").map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <div key={item.href}>
                    <Link href={item.href} prefetch
                      className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium", active ? "bg-brand text-white" : "text-gray-700 hover:bg-gray-100")}>
                      <item.icon className="h-4 w-4" /> {item.label}
                    </Link>
                    {item.children ? (
                      <div className="ml-5 border-l border-gray-200 pl-3">
                        {item.children.filter((child) => role === "ADMIN" || child.href === "/hours").map((child) => {
                          const childActive = pathname === child.href;
                          return <Link key={child.href} href={child.href} prefetch
                            className={cn("block rounded-lg px-3 py-2 text-sm", childActive ? "bg-gray-100 font-medium text-gray-900" : "text-gray-600 hover:bg-gray-100")}>
                            <child.icon className="mr-2 inline-block h-3.5 w-3.5" />
                            {child.label}
                          </Link>;
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </nav>
            <Button className="mt-4 w-full justify-center" variant="secondary" onClick={logout} disabled={isPending}>
              <LogOut className="mr-2 h-4 w-4" /> {isPending ? "Saliendo…" : "Salir"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
