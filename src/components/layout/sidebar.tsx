"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/layout/brand-logo";
import { navigationItems } from "@/components/layout/navigation-config";
import { cn } from "@/lib/utils";

export function Sidebar({ role }: { role?: "ADMIN" | "COLLABORATOR" }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col bg-gray-900 text-gray-300 lg:flex">
      <div className="px-4 py-4">
        <Link href="/" className="block cursor-pointer hover:opacity-80 transition-opacity">
          <BrandLogo className="max-w-[160px] rounded-lg" priority />
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 px-2">
        {navigationItems.filter((item) => role === "ADMIN" || item.href === "/hours").map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <div key={item.href}>
              <Link href={item.href}
                className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-brand text-white" : "text-gray-300 hover:bg-gray-800 hover:text-white")}>
                <item.icon className="h-4 w-4" /> {item.label}
              </Link>
              {item.children ? (
                <div className="ml-5 border-l border-gray-700 pl-3">
                  {item.children.filter((child) => role === "ADMIN" || child.href === "/hours").map((child) => {
                    const childActive = pathname === child.href;
                    return <Link key={child.href} href={child.href}
                      className={cn("block rounded-lg px-3 py-1.5 text-sm transition-colors",
                        childActive ? "bg-gray-700 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white")}>
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
    </aside>
  );
}
