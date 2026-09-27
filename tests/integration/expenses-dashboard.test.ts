import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createCategory, deleteCategory } from "@/server/services/expense-categories";
import { createExpense, updateExpense, deleteExpense, getExpense } from "@/server/services/expenses";
import { getDashboard } from "@/server/services/dashboard";
import { createClient } from "@/server/services/clients";
import { createProject } from "@/server/services/projects";
import { ensureIncomeTypes } from "../helpers/income-types";

const url = process.env.DATABASE_URL_TEST;
const skip = !url;
const prisma = new PrismaClient({ datasources: { db: { url } } });

let catId: string; let catId2: string; let clientId: string; let projectId: string; let otherTypeId: string; const ids: string[] = [];

beforeAll(async () => {
  if (skip) return;
  const c = await createCategory({ name: `test-cat-${Date.now()}` }); catId = c.id;
  const c2 = await createCategory({ name: `test-cat2-${Date.now()}` }); catId2 = c2.id;
  const cl = await createClient({ name: `test-exp-client-${Date.now()}` }); clientId = cl.id;
  const p = await createProject({ clientId, name: `test-exp-proj-${Date.now()}`, isActive: true }); projectId = p.id;
  const types = await ensureIncomeTypes(prisma);
  otherTypeId = types.other;
});

afterAll(async () => {
  if (skip) return;
  for (const id of ids) { try { await prisma.expense.delete({ where: { id } }).catch(() => {}); } catch {} }
  try { await prisma.project.deleteMany({ where: { clientId } }); } catch {}
  try { await prisma.client.deleteMany({ where: { id: clientId } }); } catch {}
  try { await deleteCategory(catId).catch(() => {}); } catch {}
  try { await deleteCategory(catId2).catch(() => {}); } catch {}
  await prisma.$disconnect();
});

function track(id: string) { ids.push(id); }

describe.skipIf(skip)("Categorias", () => {
  it("1. crea categoria", async () => {
    const c = await createCategory({ name: `c-${Date.now()}` });
    expect(c.id).toBeDefined(); await deleteCategory(c.id);
  });
  it("2. edita categoria", async () => {
    const c = await createCategory({ name: `ce-${Date.now()}` });
    const u = await prisma.expenseCategory.update({ where: { id: c.id }, data: { name: `ce-updated-${Date.now()}` } });
    expect(u.name).not.toBe(c.name); await deleteCategory(c.id);
  });
  it("3. rechaza duplicada case-insensitive", async () => {
    const name = `dup-${Date.now()}`;
    await createCategory({ name }); await expect(createCategory({ name: name.toUpperCase() })).rejects.toThrow("existe");
    const c = await prisma.expenseCategory.findFirst({ where: { name } }); await deleteCategory(c!.id);
  });
  it("4. bloquea eliminacion con gastos", async () => {
    const e = await createExpense({ expenseCategoryId: catId, type: "FIXED", concept: "test", status: "PAID", amountUsd: 10, effectiveDate: "2026-01-01" }); track(e.id);
    await expect(deleteCategory(catId)).rejects.toThrow("gastos");
  });
  it("5. elimina categoria vacia", async () => {
    const c = await createCategory({ name: `empty-${Date.now()}` });
    await deleteCategory(c.id);
    await expect(prisma.expenseCategory.findUnique({ where: { id: c.id } })).resolves.toBeNull();
  });
});

describe.skipIf(skip)("Gastos", () => {
  it("6. crea gasto USD pendiente", async () => {
    const e = await createExpense({ expenseCategoryId: catId, type: "FIXED", concept: "USD pend", status: "PENDING", amountUsd: 50, dueDate: "2026-12-01" }); track(e.id);
    expect(e.status).toBe("PENDING"); expect(e.dueDate).not.toBeNull();
  });
  it("7. crea gasto ARS y verifica USD", async () => {
    const e = await createExpense({ expenseCategoryId: catId, type: "FIXED", concept: "ARS calc", status: "PAID", amountArs: 81000, exchangeRate: 810, effectiveDate: "2026-01-01" }); track(e.id);
    expect(Number(e.amountUsd)).toBeCloseTo(100, 4);
  });
  it("8. crea gasto con proyecto", async () => {
    const e = await createExpense({ expenseCategoryId: catId, type: "VARIABLE", concept: "Proj", status: "PAID", projectId, amountUsd: 75, effectiveDate: "2026-01-01" }); track(e.id);
    expect(e.projectId).toBe(projectId);
  });
  it("9. marca gasto como pagado y limpia dueDate", async () => {
    const e = await createExpense({ expenseCategoryId: catId, type: "FIXED", concept: "ToPay", status: "PENDING", amountUsd: 25, dueDate: "2026-06-01" }); track(e.id);
    const paid = await updateExpense(e.id, { expenseCategoryId: catId, type: "FIXED", concept: "ToPay", status: "PAID", amountUsd: 30, effectiveDate: "2026-05-01", dueDate: e.dueDate?.toISOString().slice(0, 10) ?? null });
    expect(paid.status).toBe("PAID"); expect(paid.effectiveDate).not.toBeNull(); expect(paid.dueDate).toBeNull(); expect(Number(paid.amountUsd)).toBe(30);
  });
  it("10. edita gasto pagado", async () => {
    const e = await createExpense({ expenseCategoryId: catId, type: "FIXED", concept: "Edit me", status: "PAID", amountUsd: 100, effectiveDate: "2026-01-01" }); track(e.id);
    const u = await updateExpense(e.id, { expenseCategoryId: catId, type: "FIXED", concept: "Edited", status: "PAID", amountUsd: 200, effectiveDate: "2026-02-01" });
    expect(u.concept).toBe("Edited");
  });
  it("11. elimina gasto pendiente", async () => {
    const e = await createExpense({ expenseCategoryId: catId, type: "FIXED", concept: "Del pend", status: "PENDING", amountUsd: 5, dueDate: "2026-12-01" });
    await deleteExpense(e.id); await expect(getExpense(e.id)).rejects.toThrow("no encontrado");
  });
  it("12. elimina gasto pagado", async () => {
    const e = await createExpense({ expenseCategoryId: catId, type: "FIXED", concept: "Del paid", status: "PAID", amountUsd: 5, effectiveDate: "2026-01-01" });
    await deleteExpense(e.id); await expect(getExpense(e.id)).rejects.toThrow("no encontrado");
  });
  it("13. calcula vencido sin persistir OVERDUE", async () => {
    const e = await createExpense({ expenseCategoryId: catId, type: "FIXED", concept: "Old", status: "PENDING", amountUsd: 3, dueDate: "2020-01-01" }); track(e.id);
    const fetched = await getExpense(e.id);
    expect(fetched.status).toBe("PENDING"); // never OVERDUE in DB
  });
});

describe.skipIf(skip)("Dashboard", () => {
  it("14-18. metricas basicas", async () => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = now;
    const d = await getDashboard(from, to);

    // Create a paid income this month
    const inc = await prisma.income.create({ data: { typeId: otherTypeId, concept: "Dash test", status: "PAID", amountUsd: 500, effectiveDate: now } }); track(inc.id);
    const d2 = await getDashboard(from, to);
    expect(d2.kpis.paidIncomesUsd).toBeGreaterThanOrEqual(d.kpis.paidIncomesUsd);
    await prisma.income.delete({ where: { id: inc.id } });

    // Create a pending income with future dueDate → should appear as pending
    const future = new Date(now.getFullYear(), now.getMonth(), 15);
    const pInc = await prisma.income.create({ data: { typeId: otherTypeId, concept: "Dash pend", status: "PENDING", amountUsd: 100, dueDate: future } }); track(pInc.id);
    const d3 = await getDashboard(from, to);
    expect(d3.kpis.pendingIncomesUsd).toBeGreaterThanOrEqual(d.kpis.pendingIncomesUsd);
    await prisma.income.delete({ where: { id: pInc.id } });

    // Vencido: income PAST due, PENDING
    const oldInc = await prisma.income.create({ data: { typeId: otherTypeId, concept: "Dash old", status: "PENDING", amountUsd: 10, dueDate: new Date("2020-01-01") } }); track(oldInc.id);
    const d4 = await getDashboard(from, to);
    expect(d4.kpis.overdueIncomesCount).toBeGreaterThanOrEqual(1);
    await prisma.income.delete({ where: { id: oldInc.id } });

    // Upcoming
    const in7 = new Date(); in7.setDate(in7.getDate() + 3);
    const upInc = await prisma.income.create({ data: { typeId: otherTypeId, concept: "Dash 7d", status: "PENDING", amountUsd: 55, dueDate: in7 } }); track(upInc.id);
    const d5 = await getDashboard(from, to);
    const found = d5.upcomingIncomes.some((x: { id: string }) => x.id === upInc.id);
    expect(found).toBe(true);
    await prisma.income.delete({ where: { id: upInc.id } });
  });
});
