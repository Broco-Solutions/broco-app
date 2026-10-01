export type OperationalTaskSortKey = "due" | "created" | "updated" | "status" | "assignee";
export type OperationalTaskClientSort = "auto" | `${OperationalTaskSortKey}-asc` | `${OperationalTaskSortKey}-desc`;

export type OperationalTaskSortable = {
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  status: "PENDING" | "IN_PROGRESS" | "BLOCKED" | "DONE";
  assignee: { name: string };
};

const STATUS_ORDER = { PENDING: 0, IN_PROGRESS: 1, BLOCKED: 2, DONE: 3 } as const;

function nullableDate(a: string | null, b: string | null) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

export function compareOperationalTasks(
  a: OperationalTaskSortable,
  b: OperationalTaskSortable,
  sort: OperationalTaskClientSort,
) {
  if (sort === "auto") {
    const status = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    return status || nullableDate(a.dueDate, b.dueDate) || b.updatedAt.localeCompare(a.updatedAt);
  }
  const [key, direction] = sort.split("-") as [OperationalTaskSortKey, "asc" | "desc"];
  let result = 0;
  if (key === "due") result = nullableDate(a.dueDate, b.dueDate);
  if (key === "created") result = a.createdAt.localeCompare(b.createdAt);
  if (key === "updated") result = a.updatedAt.localeCompare(b.updatedAt);
  if (key === "status") result = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (key === "assignee") result = a.assignee.name.localeCompare(b.assignee.name, "es-AR");
  return direction === "desc" ? -result : result;
}

export function toggleOperationalTaskSort(
  current: OperationalTaskClientSort,
  key: OperationalTaskSortKey,
): OperationalTaskClientSort {
  if (current !== `${key}-asc` && current !== `${key}-desc`) return `${key}-asc`;
  if (current === `${key}-asc`) return `${key}-desc`;
  return "auto";
}
