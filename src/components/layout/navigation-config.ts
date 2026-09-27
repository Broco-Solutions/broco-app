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
  { href: "/hours", label: "Horas", icon: BriefcaseBusiness },
  { href: "/hours/reports", label: "Reportes de horas", icon: Activity },
  { href: "/hours/team", label: "Equipo", icon: BriefcaseBusiness },
] as const;
