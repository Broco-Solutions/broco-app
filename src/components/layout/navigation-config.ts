import {
  BriefcaseBusiness,
  CircleDollarSign,
  LayoutDashboard,
  Activity,
  Layers,
} from "lucide-react";

export const navigationItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clientes", icon: BriefcaseBusiness },
  { href: "/projects", label: "Proyectos", icon: Layers },
  { href: "/incomes", label: "Ingresos", icon: CircleDollarSign },
  { href: "/expenses", label: "Gastos", icon: Activity },
  { href: "/hours", label: "Tiempos", icon: BriefcaseBusiness },
  { href: "/hours/reports", label: "Reportes", icon: Activity },
  { href: "/hours/team", label: "Asignaciones", icon: BriefcaseBusiness },
  { href: "/users", label: "Administración", icon: BriefcaseBusiness },
] as const;
