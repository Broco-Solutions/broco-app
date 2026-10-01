import { Badge } from "@/components/ui/badge";
import type { OperationalTaskStatusDTO } from "@/app/tasks/types";

export const OPERATIONAL_STATUS_LABELS: Record<OperationalTaskStatusDTO, string> = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En progreso",
  BLOCKED: "Bloqueada",
  DONE: "Completada",
};

export function OperationalTaskStatusBadge({ status }: { status: OperationalTaskStatusDTO }) {
  const tone = status === "DONE" ? "success" : status === "BLOCKED" ? "danger" : status === "IN_PROGRESS" ? "warning" : "neutral";
  return <Badge tone={tone}>{OPERATIONAL_STATUS_LABELS[status]}</Badge>;
}
