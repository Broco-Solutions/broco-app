export type OperationalTaskStatusDTO = "PENDING" | "IN_PROGRESS" | "BLOCKED" | "DONE";

export type OperationalTaskDTO = {
  id: string;
  title: string;
  description: string | null;
  referenceUrl: string | null;
  status: OperationalTaskStatusDTO;
  creatorId: string;
  assigneeId: string;
  projectId: string | null;
  dueDate: string | null;
  blockedReason: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  creator: { id: string; name: string };
  assignee: { id: string; name: string; isActive: boolean };
  project: { id: string; name: string; isActive: boolean; client: { id: string; name: string } } | null;
  timeMinutes: number;
  timeEntries: Array<{
    id: string;
    userId: string;
    workDate: string;
    minutes: number;
    description: string;
    status: string;
    voidReason: string | null;
    updatedAt: string;
    user: { id: string; name: string };
  }>;
};

export type TaskProjectOption = {
  id: string;
  name: string;
  isActive: boolean;
  client: { id: string; name: string };
};

export type TaskAssigneeOption = { id: string; name: string; role: "ADMIN" | "COLLABORATOR" };
