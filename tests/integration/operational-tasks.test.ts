import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth";
import { prisma } from "@/server/prisma";
import {
  changeOperationalTaskStatus,
  createOperationalTask,
  getOperationalTask,
  listOperationalTaskProjectOptions,
  listOperationalTasks,
  updateOperationalTask,
} from "@/server/services/operational-tasks";

const suite = process.env.DATABASE_URL_TEST ? describe : describe.skip;
const suffix = crypto.randomUUID();
let admin: CurrentUser;
let collaboratorA: CurrentUser;
let collaboratorB: CurrentUser;
let clientId = "";
let projectAId = "";
let projectBId = "";

suite("Tareas Operativas — dominio y seguridad", () => {
  beforeAll(async () => {
    const [adminRow, collaboratorARow, collaboratorBRow] = await Promise.all([
      prisma.appUser.create({ data: { name: "Task Admin", email: `task-admin-${suffix}@test.local`, passwordHash: "test", role: "ADMIN", isActive: true } }),
      prisma.appUser.create({ data: { name: "Task Col A", email: `task-col-a-${suffix}@test.local`, passwordHash: "test", role: "COLLABORATOR", isActive: true } }),
      prisma.appUser.create({ data: { name: "Task Col B", email: `task-col-b-${suffix}@test.local`, passwordHash: "test", role: "COLLABORATOR", isActive: true } }),
    ]);
    admin = { ...adminRow, role: "ADMIN" };
    collaboratorA = { ...collaboratorARow, role: "COLLABORATOR" };
    collaboratorB = { ...collaboratorBRow, role: "COLLABORATOR" };

    const client = await prisma.client.create({ data: { name: `Task Client ${suffix}` } });
    clientId = client.id;
    const [projectA, projectB] = await Promise.all([
      prisma.project.create({ data: { clientId, name: "Proyecto igual" } }),
      prisma.project.create({ data: { clientId, name: "Proyecto B" } }),
    ]);
    projectAId = projectA.id;
    projectBId = projectB.id;
    await prisma.hourAssignment.create({ data: { userId: collaboratorA.id, projectId: projectAId } });
  });

  afterAll(async () => {
    await prisma.operationalTask.deleteMany({ where: { creatorId: { in: [admin.id, collaboratorA.id, collaboratorB.id] } } });
    await prisma.hourAssignment.deleteMany({ where: { userId: { in: [collaboratorA.id, collaboratorB.id] } } });
    await prisma.project.deleteMany({ where: { id: { in: [projectAId, projectBId] } } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.appUser.deleteMany({ where: { id: { in: [admin.id, collaboratorA.id, collaboratorB.id] } } });
  });

  it("fuerza creador y responsable propios para COLLABORATOR", async () => {
    const task = await createOperationalTask(collaboratorA, {
      title: "Tarea propia",
      assigneeId: collaboratorB.id,
      projectId: projectAId,
      dueDate: null,
      description: null,
    });
    expect(task.creatorId).toBe(collaboratorA.id);
    expect(task.assigneeId).toBe(collaboratorA.id);
    expect(task.project?.client.id).toBe(clientId);
  });

  it("limita proyectos al HourAssignment actual", async () => {
    const options = await listOperationalTaskProjectOptions(collaboratorA);
    expect(options.map((project) => project.id)).toContain(projectAId);
    expect(options.map((project) => project.id)).not.toContain(projectBId);
    await expect(createOperationalTask(collaboratorA, { title: "Fuera de scope", projectId: projectBId }))
      .rejects.toThrow("autorización");
  });

  it("permite a ADMIN crear y reasignar para usuarios activos", async () => {
    const task = await createOperationalTask(admin, { title: "Asignada", assigneeId: collaboratorB.id, projectId: projectBId });
    expect(task.creatorId).toBe(admin.id);
    expect(task.assigneeId).toBe(collaboratorB.id);
    const updated = await updateOperationalTask(admin, task.id, {
      assigneeId: collaboratorA.id,
      expectedUpdatedAt: task.updatedAt.toISOString(),
    });
    expect(updated.assigneeId).toBe(collaboratorA.id);
  });

  it("aplica alcance en listado, detalle y mutación aunque se conozca el ID", async () => {
    const foreign = await createOperationalTask(admin, { title: "Ajena", assigneeId: collaboratorB.id });
    const own = await listOperationalTasks(collaboratorA);
    expect(own.every((task) => task.assigneeId === collaboratorA.id)).toBe(true);
    await expect(getOperationalTask(collaboratorA, foreign.id)).rejects.toThrow("no encontrada");
    await expect(updateOperationalTask(collaboratorA, foreign.id, {
      title: "IDOR",
      expectedUpdatedAt: foreign.updatedAt.toISOString(),
    })).rejects.toThrow("no encontrada");
  });

  it("evita last-write-wins con expectedUpdatedAt", async () => {
    const task = await createOperationalTask(collaboratorA, { title: "Concurrencia" });
    const first = await updateOperationalTask(collaboratorA, task.id, {
      title: "Primera edición",
      expectedUpdatedAt: task.updatedAt.toISOString(),
    });
    expect(first.title).toBe("Primera edición");
    await expect(updateOperationalTask(collaboratorA, task.id, {
      title: "Edición obsoleta",
      expectedUpdatedAt: task.updatedAt.toISOString(),
    })).rejects.toThrow("cambió");
  });

  it("exige motivo al bloquear, lo conserva y mantiene completedAt coherente", async () => {
    const task = await createOperationalTask(collaboratorA, { title: "Flujo de estado" });
    await expect(changeOperationalTaskStatus(collaboratorA, task.id, {
      status: "BLOCKED",
      blockedReason: "",
      expectedUpdatedAt: task.updatedAt.toISOString(),
    })).rejects.toThrow("continuar");

    const blocked = await changeOperationalTaskStatus(collaboratorA, task.id, {
      status: "BLOCKED",
      blockedReason: "Necesito acceso del cliente",
      expectedUpdatedAt: task.updatedAt.toISOString(),
    });
    expect(blocked.task.blockedReason).toBe("Necesito acceso del cliente");
    const resumed = await changeOperationalTaskStatus(collaboratorA, task.id, {
      status: "IN_PROGRESS",
      expectedUpdatedAt: blocked.task.updatedAt.toISOString(),
    });
    expect(resumed.task.blockedReason).toBe("Necesito acceso del cliente");

    const done = await changeOperationalTaskStatus(collaboratorA, task.id, {
      status: "DONE",
      expectedUpdatedAt: resumed.task.updatedAt.toISOString(),
    });
    expect(done.justCompleted).toBe(true);
    expect(done.task.completedAt).not.toBeNull();
    const reopened = await changeOperationalTaskStatus(collaboratorA, task.id, {
      status: "PENDING",
      expectedUpdatedAt: done.task.updatedAt.toISOString(),
    });
    expect(reopened.task.completedAt).toBeNull();
  });
});
