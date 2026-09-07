import { describe, it, expect } from "vitest";
import { toDhtmlxData } from "@/components/projects/dhtmlx/project-gantt-adapter";
import type { PhaseDTO, TaskDTO } from "@/components/projects/dhtmlx/project-gantt-types";

const phase = (id: string, name: string, position = 0): PhaseDTO => ({ id, name, position });
const task = (over: Partial<TaskDTO>): TaskDTO => ({
  id: "t1",
  phaseId: null,
  name: "Tarea",
  description: null,
  type: "TASK",
  startDate: "2026-01-01",
  endDate: "2026-01-10",
  status: "TODO",
  position: 0,
  clientVisible: true,
  ...over,
});

type DTask = {
  id: string;
  text: string;
  type?: string;
  parent?: string | number;
  start_date?: Date;
  end_date?: Date;
  status?: string;
};

describe("toDhtmlxData", () => {
  it("mapea phase → project y ordena por position", () => {
    const phases = [phase("p2", "Desarrollo", 1), phase("p1", "Diseño", 0)];
    const tasks = [
      task({ id: "a", phaseId: "p1", position: 1 }),
      task({ id: "b", phaseId: "p1", position: 0 }),
      task({ id: "c", phaseId: "p2", position: 0 }),
    ];
    const out = toDhtmlxData(phases, tasks) as DTask[];
    const p1 = out.find((t) => t.id === "p1");
    const p2 = out.find((t) => t.id === "p2");
    expect(out[0].id).toBe("p1");
    expect(p1?.type).toBe("project");
    expect(out.indexOf(p2!)).toBeGreaterThan(out.indexOf(p1!));
    // tasks dentro de la fase, ordenadas por position
    const b = out.find((t) => t.id === "b");
    const a = out.find((t) => t.id === "a");
    expect(b?.parent).toBe("p1");
    expect(a?.parent).toBe("p1");
    expect(out.indexOf(b!)).toBeLessThan(out.indexOf(a!));
  });

  it("TASK → type task con fechas", () => {
    const out = toDhtmlxData([], [task({ startDate: "2026-02-01", endDate: "2026-02-05" })]) as DTask[];
    expect(out[0].type).toBe("task");
    expect(out[0].start_date?.toISOString().slice(0, 10)).toBe("2026-02-01");
    expect(out[0].end_date?.toISOString().slice(0, 10)).toBe("2026-02-05");
  });

  it("MILESTONE → type milestone con start = end", () => {
    const out = toDhtmlxData([], [task({ type: "MILESTONE", startDate: "2026-03-15", endDate: "2026-03-15" })]) as DTask[];
    expect(out[0].type).toBe("milestone");
    expect(out[0].start_date?.toISOString().slice(0, 10)).toBe("2026-03-15");
    expect(out[0].end_date?.toISOString().slice(0, 10)).toBe("2026-03-15");
  });

  it("omite fases sin tareas", () => {
    const phases = [phase("p1", "Con tareas", 0), phase("p2", "Vacía", 1)];
    const tasks = [task({ id: "a", phaseId: "p1" })];
    const out = toDhtmlxData(phases, tasks) as DTask[];
    expect(out.find((t) => t.id === "p2")).toBeUndefined();
    expect(out.find((t) => t.id === "p1")).toBeDefined();
  });

  it("tareas sin fase quedan a nivel raíz (parent 0)", () => {
    const out = toDhtmlxData([], [task({ id: "x", phaseId: null })]) as DTask[];
    expect(out[0].parent).toBe(0);
  });

  it("preserva la fecha calendario local para strings YYYY-MM-DD e ISO", () => {
    const out = toDhtmlxData([], [
      task({ id: "date-only", startDate: "2027-02-01", endDate: "2027-02-01" }),
      task({ id: "iso", startDate: "2027-02-01T00:00:00.000Z", endDate: "2027-02-01T00:00:00.000Z" }),
    ]) as DTask[];
    for (const item of out) {
      expect(item.start_date).toMatchObject({ getFullYear: expect.any(Function) });
      expect(item.start_date?.getFullYear()).toBe(2027);
      expect(item.start_date?.getMonth()).toBe(1);
      expect(item.start_date?.getDate()).toBe(1);
    }
  });
});
describe("toDhtmlxData filtrado", () => {
  const phases = [phase("p1", "Descubrimiento", 0), phase("p2", "Desarrollo", 1)];
  const tasks = [
    task({ id: "t1", phaseId: "p1", name: "Tarea", status: "IN_PROGRESS" }),
    task({ id: "m1", phaseId: "p1", name: "Hito", type: "MILESTONE", status: "DONE" }),
    task({ id: "t2", phaseId: "p2", name: "Otra" }),
  ];

  it("filtro tipo milestone conserva fase padre y omite tareas", () => {
    const out = toDhtmlxData(phases, tasks, { type: "milestone", status: "all" }) as DTask[];
    expect(out.find((t) => t.id === "p1")).toBeDefined();
    expect(out.find((t) => t.id === "m1")).toBeDefined();
    expect(out.find((t) => t.id === "t1")).toBeUndefined();
    // fase sin hitos se omite
    expect(out.find((t) => t.id === "p2")).toBeUndefined();
  });

  it("filtro estado conserva fase con hijos que coinciden", () => {
    const out = toDhtmlxData(phases, tasks, { type: "all", status: "IN_PROGRESS" }) as DTask[];
    expect(out.find((t) => t.id === "p1")).toBeDefined();
    expect(out.find((t) => t.id === "t1")).toBeDefined();
    expect(out.find((t) => t.id === "t2")).toBeUndefined();
    expect(out.find((t) => t.id === "p2")).toBeUndefined();
  });

  it("conserva el hito real Go-live del sistema", () => {
    const realGoLive = task({ id: "gl", phaseId: "p2", name: "Go-live del sistema", type: "MILESTONE", startDate: "2027-02-01", endDate: "2027-02-01", status: "TODO" });
    const out = toDhtmlxData(phases, [...tasks, realGoLive], { type: "all", status: "all" }) as DTask[];
    expect(out.find((t) => t.id === "gl")).toMatchObject({ type: "milestone", parent: "p2", status: "TODO" });
    expect(out.find((t) => t.id === "go-live")).toBeUndefined();
  });
});
