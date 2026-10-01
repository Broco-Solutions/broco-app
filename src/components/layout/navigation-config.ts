import {
  BriefcaseBusiness,
  CircleDollarSign,
  LayoutDashboard,
  Activity,
  Layers,
  ListChecks,
  Settings2,
  UserRoundCog,
  UsersRound,
  Clock3,
  ListTodo,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavigationChild = { href: string; label: string; icon: LucideIcon };
type NavigationItem = { href: string; label: string; icon: LucideIcon; children?: readonly NavigationChild[] };

export const navigationItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clientes", icon: BriefcaseBusiness },
  { href: "/projects", label: "Proyectos", icon: Layers },
  { href: "/incomes", label: "Ingresos", icon: CircleDollarSign },
  { href: "/expenses", label: "Gastos", icon: Activity },
  { href: "/tasks", label: "Tareas", icon: ListTodo },
  {
    href: "/hours",
    label: "Tiempos",
    icon: Clock3,
    children: [
      { href: "/hours", label: "Registros", icon: ListChecks },
      { href: "/hours/reports", label: "Reportes", icon: Activity },
      { href: "/hours/team", label: "Asignaciones", icon: UserRoundCog },
    ],
  },
  {
    href: "/users",
    label: "Administración",
    icon: Settings2,
    children: [{ href: "/users", label: "Usuarios", icon: UsersRound }],
  },
] satisfies readonly NavigationItem[];
