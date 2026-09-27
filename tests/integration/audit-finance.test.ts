import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/prisma";
import { createIncome, getIncome, markIncomePaidForMcp } from "@/server/services/incomes";
import { createExpense, getExpense, markExpensePaidForMcp } from "@/server/services/expenses";
import { bulkUpdateIncomes } from "@/server/services/incomes";
import { bulkUpdateExpenses } from "@/server/services/expenses";

vi.mock("@/lib/auth", () => ({ requireRole: vi.fn(async () => ({ id: "audit-admin", role: "ADMIN" })) }));

const { payIncome } = await import("@/app/incomes/actions");
const { payExpense } = await import("@/app/expenses/actions");

const hasDb = Boolean(process.env.DATABASE_URL_TEST);
const suite = hasDb ? describe : describe.skip;
const ids = { incomes: [] as string[], expenses: [] as string[] };
let incomeTypeId = "";
let categoryId = "";

function paymentForm(id: string, currency: "USD" | "ARS", date: string, amount: string, fx?: string) {
  const form = new FormData();
  form.set("id", id);
  form.set("currency", currency);
  form.set("effectiveDate", date);
  if (currency === "USD") form.set("amountUsd", amount);
  else {
    form.set("amountArs", amount);
    form.set("exchangeRate", fx ?? "");
  }
  return form;
}

suite("regresiones de pago/cobro financiero", () => {
  beforeAll(async () => {
    incomeTypeId = (await prisma.incomeType.findFirstOrThrow({ where: { isActive: true, requiresProject: false }, select: { id: true } })).id;
    categoryId = (await prisma.expenseCategory.findFirstOrThrow({ where: { isActive: true }, select: { id: true } })).id;
  });

  afterEach(async () => {
    await prisma.income.deleteMany({ where: { id: { in: ids.incomes.splice(0) } } });
    await prisma.expense.deleteMany({ where: { id: { in: ids.expenses.splice(0) } } });
  });

  it("cobra ingreso ARS → USD y limpia ARS/TC/vencimiento", async () => {
    const income = await createIncome({ typeId: incomeTypeId, concept: "audit income ars-usd", status: "PENDING", amountArs: 150000, exchangeRate: 1500, dueDate: "2026-06-01" });
    ids.incomes.push(income.id);
    expect(await payIncome(null, paymentForm(income.id, "USD", "2026-06-02", "200"))).toEqual({ success: true });
    const saved = await getIncome(income.id);
    expect(Number(saved.amountUsd)).toBe(200);
    expect(saved.amountArs).toBeNull();
    expect(saved.exchangeRate).toBeNull();
    expect(saved.dueDate).toBeNull();
    expect(saved.effectiveDate?.toISOString().slice(0, 10)).toBe("2026-06-02");
  });

  it("cobra ingreso USD → ARS y recalcula USD", async () => {
    const income = await createIncome({ typeId: incomeTypeId, concept: "audit income usd-ars", status: "PENDING", amountUsd: 100, dueDate: "2026-06-01" });
    ids.incomes.push(income.id);
    await payIncome(null, paymentForm(income.id, "ARS", "2026-06-02", "300000", "1500"));
    const saved = await getIncome(income.id);
    expect(Number(saved.amountUsd)).toBe(200);
    expect(Number(saved.amountArs)).toBe(300000);
    expect(Number(saved.exchangeRate)).toBe(1500);
    expect(saved.dueDate).toBeNull();
  });

  it("paga gasto ARS → USD y limpia ARS/TC/vencimiento", async () => {
    const expense = await createExpense({ expenseCategoryId: categoryId, type: "FIXED", concept: "audit expense ars-usd", status: "PENDING", amountArs: 150000, exchangeRate: 1500, dueDate: "2026-06-01" });
    ids.expenses.push(expense.id);
    await payExpense(null, paymentForm(expense.id, "USD", "2026-06-02", "200"));
    const saved = await getExpense(expense.id);
    expect(Number(saved.amountUsd)).toBe(200);
    expect(saved.amountArs).toBeNull();
    expect(saved.exchangeRate).toBeNull();
    expect(saved.dueDate).toBeNull();
    expect(saved.effectiveDate?.toISOString().slice(0, 10)).toBe("2026-06-02");
  });

  it("paga gasto USD → ARS y recalcula USD", async () => {
    const expense = await createExpense({ expenseCategoryId: categoryId, type: "FIXED", concept: "audit expense usd-ars", status: "PENDING", amountUsd: 100, dueDate: "2026-06-01" });
    ids.expenses.push(expense.id);
    await payExpense(null, paymentForm(expense.id, "ARS", "2026-06-02", "300000", "1500"));
    const saved = await getExpense(expense.id);
    expect(Number(saved.amountUsd)).toBe(200);
    expect(Number(saved.amountArs)).toBe(300000);
    expect(Number(saved.exchangeRate)).toBe(1500);
    expect(saved.dueDate).toBeNull();
  });

  it("MCP marca PAID sin conservar dueDate", async () => {
    const income = await createIncome({ typeId: incomeTypeId, concept: "audit mcp income", status: "PENDING", amountUsd: 100, dueDate: "2026-06-01" });
    const expense = await createExpense({ expenseCategoryId: categoryId, type: "FIXED", concept: "audit mcp expense", status: "PENDING", amountUsd: 100, dueDate: "2026-06-01" });
    ids.incomes.push(income.id); ids.expenses.push(expense.id);
    await markIncomePaidForMcp(income.id, "2026-06-02");
    await markExpensePaidForMcp(expense.id, "2026-06-02");
    expect((await getIncome(income.id)).dueDate).toBeNull();
    expect((await getExpense(expense.id)).dueDate).toBeNull();
  });

  it("rechaza fechas calendario inválidas en bulk", async () => {
    const income = await createIncome({ typeId: incomeTypeId, concept: "audit invalid bulk income", status: "PENDING", amountUsd: 100, dueDate: "2026-06-01" });
    const expense = await createExpense({ expenseCategoryId: categoryId, type: "FIXED", concept: "audit invalid bulk expense", status: "PENDING", amountUsd: 100, dueDate: "2026-06-01" });
    ids.incomes.push(income.id); ids.expenses.push(expense.id);
    await expect(bulkUpdateIncomes([income.id], { status: "PAID", statusDate: "2026-02-30" })).rejects.toThrow("fecha");
    await expect(bulkUpdateExpenses([expense.id], { status: "PAID", statusDate: "2026-13-01" })).rejects.toThrow("fecha");
  });
});
