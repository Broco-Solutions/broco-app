"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";

export function AppShell({ children, role }: { children: React.ReactNode; role?: "ADMIN" | "COLLABORATOR" }) {
  const pathname = usePathname();

  if (pathname === "/login" || pathname === "/hours/activate" || pathname === "/p" || pathname.startsWith("/p/")) {
    return children;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar role={role} />
      <div className="min-w-0 flex-1">
        <Header role={role} />
        <main className="mx-auto max-w-[1600px] space-y-6 px-4 py-5 md:space-y-8 md:px-8 md:py-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
