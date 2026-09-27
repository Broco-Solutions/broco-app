import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ensureIncomeTypes } from "../helpers/income-types";
import { bulkUpdateIncomes } from "@/server/services/incomes";
import { bulkUpdateExpenses } from "@/server/services/expenses";

const url = process.env.DATABASE_URL_TEST;
const skip = !url;

describe.skipIf(skip)("bulk concept", () => {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const ids: string[] = [];
  let expIds: string[] = [];

  beforeAll(async () => {
    if (skip) return;
    const types = await ensureIncomeTypes(prisma);
    const cat = await prisma.expenseCategory.findFirst();
    const a = await prisma.income.create({ data: { typeId: types.other, concept: "orig1", status: "PAID", amountUsd: 10, effectiveDate: new Date() } });
    const b = await prisma.income.create({ data: { typeId: types.other, concept: "orig2", status: "PAID", amountUsd: 20, effectiveDate: new Date() } });
    ids.push(a.id, b.id);
    const e1 = await prisma.expense.create({ data: { expenseCategoryId: cat!.id, concept: "exp1", status: "PAID", amountUsd: 5, effectiveDate: new Date(), type: "VARIABLE" } });
    const e2 = await prisma.expense.create({ data: { expenseCategoryId: cat!.id, concept: "exp2", status: "PAID", amountUsd: 5, effectiveDate: new Date(), type: "VARIABLE" } });
    expIds = [e1.id, e2.id];
  });

  afterAll(async () => {
    for (const id of ids) await prisma.income.delete({ where: { id } }).catch(() => {});
    for (const id of expIds) await prisma.expense.delete({ where: { id } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("actualiza concepto en ingresos", async () => {
    await bulkUpdateIncomes(ids, { concept: "nuevo concepto" });
    const rows = await prisma.income.findMany({ where: { id: { in: ids } } });
    expect(rows.every((r) => r.concept === "nuevo concepto")).toBe(true);
  });

  it("rechaza concepto vacío en ingresos", async () => {
    await expect(bulkUpdateIncomes(ids, { concept: "   " } as any)).rejects.toThrow(/vacío/);
  });

  it("actualiza concepto en gastos", async () => {
    await bulkUpdateExpenses(expIds, { concept: "gasto nuevo" });
    const rows = await prisma.expense.findMany({ where: { id: { in: expIds } } });
    expect(rows.every((r) => r.concept === "gasto nuevo")).toBe(true);
  });

  it("rechaza concepto vacío en gastos", async () => {
    await expect(bulkUpdateExpenses(expIds, { concept: " " } as any)).rejects.toThrow(/vacío/);
  });

  it("cambia estado en lote junto con la fecha requerida", async () => {
    await expect(bulkUpdateIncomes(ids, { status: "PENDING" } as any)).rejects.toThrow(/fecha correspondiente/);
    await expect(bulkUpdateExpenses(expIds, { status: "PENDING" } as any)).rejects.toThrow(/fecha correspondiente/);

    await bulkUpdateIncomes(ids, { status: "PENDING", statusDate: "2026-10-01" });
    await bulkUpdateExpenses(expIds, { status: "PENDING", statusDate: "2026-10-01" });

    const pendingIncomes = await prisma.income.findMany({ where: { id: { in: ids } } });
    const pendingExpenses = await prisma.expense.findMany({ where: { id: { in: expIds } } });
    expect(pendingIncomes.every((r) => r.status === "PENDING" && r.dueDate && !r.effectiveDate)).toBe(true);
    expect(pendingExpenses.every((r) => r.status === "PENDING" && r.dueDate && !r.effectiveDate)).toBe(true);

    await bulkUpdateIncomes(ids, { status: "PAID", statusDate: "2026-10-15" });
    await bulkUpdateExpenses(expIds, { status: "PAID", statusDate: "2026-10-15" });
    const paidIncomes = await prisma.income.findMany({ where: { id: { in: ids } } });
    const paidExpenses = await prisma.expense.findMany({ where: { id: { in: expIds } } });
    expect(paidIncomes.every((r) => r.status === "PAID" && r.effectiveDate && !r.dueDate)).toBe(true);
    expect(paidExpenses.every((r) => r.status === "PAID" && r.effectiveDate && !r.dueDate)).toBe(true);
  });
});
