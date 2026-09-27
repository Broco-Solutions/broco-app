import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/auth";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Broco App",
  description: "Plataforma de gestión operativa para Broco Solutions: clientes, proyectos, ingresos, gastos e indicadores.",
  icons: { icon: "/broco-finanzas-favicon.ico", shortcut: "/broco-finanzas-favicon.ico", apple: "/broco-finanzas-favicon.ico" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  return (
    <html lang="es">
      <body className={`${inter.variable} font-sans antialiased bg-gray-100 text-gray-900`}>
        <AppShell role={user?.role}>{children}</AppShell>
      </body>
    </html>
  );
}
