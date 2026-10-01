import { describe, expect, it } from "vitest";
import { compareOperationalTasks, toggleOperationalTaskSort } from "@/lib/operational-task-order";

const base = {
  dueDate: "2026-10-10",
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
  status: "PENDING" as const,
  assignee: { name: "Ana" },
};

describe("orden de tareas operativas", () => {
  it("prioriza abiertas por estado y vencimiento en orden automático", () => {
    const rows = [
      { ...base, status: "DONE" as const, dueDate: "2026-10-01" },
      { ...base, dueDate: null },
      { ...base, dueDate: "2026-10-05" },
      { ...base, status: "IN_PROGRESS" as const, dueDate: "2026-10-02" },
    ].sort((a, b) => compareOperationalTasks(a, b, "auto"));
    expect(rows.map((row) => `${row.status}:${row.dueDate}`)).toEqual([
      "PENDING:2026-10-05",
      "PENDING:null",
      "IN_PROGRESS:2026-10-02",
      "DONE:2026-10-01",
    ]);
  });

  it("mantiene fechas nulas al final y alterna el encabezado", () => {
    const rows = [{ ...base, dueDate: null }, { ...base, dueDate: "2026-10-05" }]
      .sort((a, b) => compareOperationalTasks(a, b, "due-asc"));
    expect(rows[0].dueDate).toBe("2026-10-05");
    expect(toggleOperationalTaskSort("auto", "updated")).toBe("updated-asc");
    expect(toggleOperationalTaskSort("updated-asc", "updated")).toBe("updated-desc");
    expect(toggleOperationalTaskSort("updated-desc", "updated")).toBe("auto");
  });
});
