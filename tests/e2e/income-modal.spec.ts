import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./auth";

const BASE = "http://localhost:3299";

function incomeForm(page: import("@playwright/test").Page) {
  return page.getByRole("heading", { name: "Nuevo ingreso" }).locator("xpath=..").locator("form");
}

test.describe("Income modal flows", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Flujo A — new project appears in income form after creation", async ({ page }) => {
    const clientName = `FA-${Date.now()}`;
    const projectName = `FA-Proj-${Date.now()}`;

    await page.goto(BASE + "/clients", { waitUntil: "load" });
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    await page.getByPlaceholder("Nombre").fill(clientName);
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByRole("link", { name: clientName })).toBeVisible();

    await page.goto(BASE + "/projects", { waitUntil: "load" });
    await page.getByRole("button", { name: "Nuevo proyecto" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo proyecto" })).toBeVisible({ timeout: 5000 });
    const projectForm = page.getByRole("heading", { name: "Nuevo proyecto" }).locator("xpath=..").locator("form");
    await projectForm.locator("select").selectOption({ label: clientName });
    await page.getByPlaceholder("Nombre").fill(projectName);
    await projectForm.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByRole("link", { name: projectName })).toBeVisible();

    await page.goto(BASE + "/incomes", { waitUntil: "load" });
    await page.getByRole("button", { name: "Nuevo ingreso" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo ingreso" })).toBeVisible({ timeout: 5000 });

    const form = incomeForm(page);
    const modalTypeSel = form.locator("select").nth(0);
    const modalClientSel = form.locator("select").nth(1);
    await modalTypeSel.selectOption({ label: "Desarrollo" });
    await modalClientSel.selectOption({ label: clientName });

    const modalProjSel = form.locator("select").nth(2);
    const projOpts = await modalProjSel.locator("option").allTextContents();
    expect(projOpts.some(o => o.includes(projectName))).toBe(true);

    await modalProjSel.selectOption({ label: projectName });
    await page.getByPlaceholder("Concepto *").fill("Test income A");
    const dateInputs = page.locator('input[type="date"]');
    if (await dateInputs.count() > 0) await dateInputs.last().fill("2026-07-15");
    await page.getByPlaceholder("Monto USD").fill("100");
    await form.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Test income A").first()).toBeVisible();

    await page.goto(BASE + "/incomes", { waitUntil: "load" });
    await expect(page.getByText("Test income A").first()).toBeVisible({ timeout: 5000 });
  });

  test("Flujo B — switching client resets project and filters correctly", async ({ page }) => {
    await page.goto(BASE + "/incomes", { waitUntil: "load" });
    await page.getByRole("button", { name: "Nuevo ingreso" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo ingreso" })).toBeVisible({ timeout: 5000 });

    const form = incomeForm(page);
    const modalTypeSel = form.locator("select").nth(0);
    const modalClientSel = form.locator("select").nth(1);
    const modalProjSel = form.locator("select").nth(2);

    await modalTypeSel.selectOption({ label: "Desarrollo" });

    const clientOpts = await modalClientSel.locator("option").allTextContents();
    let firstClient = "";
    for (const o of clientOpts) {
      if (o && !o.includes("Seleccionar") && !o.includes("*")) { firstClient = o; break; }
    }
    if (!firstClient) { await page.getByRole("button", { name: "Cancelar" }).click(); return; }

    await modalClientSel.selectOption({ label: firstClient });
    await page.waitForTimeout(500);
    await expect(modalProjSel).toBeEnabled();

    let secondClient = "";
    for (const o of clientOpts) {
      if (o && o !== firstClient && !o.includes("Seleccionar") && !o.includes("*")) { secondClient = o; break; }
    }

    if (secondClient) {
      await modalClientSel.selectOption({ label: secondClient });
      await page.waitForTimeout(500);
      await expect(modalProjSel).toHaveValue("");
    }

    await page.getByRole("button", { name: "Cancelar" }).click();
  });

  test("Flujo C — modal responsive no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE + "/incomes", { waitUntil: "load" });
    await page.getByRole("button", { name: "Nuevo ingreso" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo ingreso" })).toBeVisible({ timeout: 5000 });

    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    const cw = await page.evaluate(() => document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(cw + 1);

    await expect(page.getByRole("button", { name: "Guardar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancelar" })).toBeVisible();

    await page.getByText("Agregar varios ingresos").click();
    await page.waitForTimeout(300);

    const sw2 = await page.evaluate(() => document.documentElement.scrollWidth);
    const cw2 = await page.evaluate(() => document.documentElement.clientWidth);
    expect(sw2).toBeLessThanOrEqual(cw2 + 1);

    await page.getByRole("button", { name: "Cancelar" }).click();
  });

  test("Cobrar reinicializa moneda e importes al cambiar de ingreso", async ({ page }) => {
    const concept = `Modal currency ${Date.now()}`;
    const usdConcept = `Modal currency USD ${Date.now()}`;
    await page.goto(BASE + "/incomes", { waitUntil: "load" });
    await page.getByRole("button", { name: "Nuevo ingreso" }).click();
    let form = incomeForm(page);
    await form.locator("select").nth(0).selectOption({ label: "Otro" });
    await form.locator("select").nth(3).selectOption("PENDING");
    await form.locator('input[type="date"]').fill("2026-09-27");
    await form.getByRole("checkbox", { name: "Cargar en ARS" }).check();
    await form.getByPlaceholder("Concepto *").fill(concept);
    await form.getByPlaceholder("Monto ARS").fill("123000");
    await form.getByPlaceholder("Tipo de cambio").fill("1230");
    await form.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Nuevo ingreso" })).toBeHidden();
    await page.reload({ waitUntil: "load" });
    await page.locator("select").first().selectOption("all");
    await page.getByPlaceholder("Buscar concepto…").fill(concept);
    const createdRow = page.locator("tr").filter({ hasText: concept });
    await expect(createdRow).toBeVisible({ timeout: 5000 });
    await createdRow.getByRole("button", { name: "Cobrar" }).click();
    await expect(page.getByRole("heading", { name: "Marcar como cobrado" })).toBeVisible();
    await expect(page.getByPlaceholder("Monto ARS")).toHaveValue("123000");
    await expect(page.getByPlaceholder("Tipo de cambio")).toHaveValue("1230");
    await page.getByRole("button", { name: "Cancelar" }).click();

    await page.getByRole("button", { name: "Nuevo ingreso" }).click();
    form = incomeForm(page);
    await form.locator("select").nth(0).selectOption({ label: "Otro" });
    await form.locator("select").nth(3).selectOption("PENDING");
    await form.locator('input[type="date"]').fill("2026-09-27");
    await form.getByPlaceholder("Concepto *").fill(usdConcept);
    await form.getByPlaceholder("Monto USD").fill("150");
    await form.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Nuevo ingreso" })).toBeHidden();
    await page.reload({ waitUntil: "load" });
    await page.locator("select").first().selectOption("all");

    const usdRow = page.locator("tr").filter({ hasText: usdConcept });
    await expect(usdRow).toBeVisible();
    await usdRow.getByRole("button", { name: "Cobrar" }).click();
    await expect(page.getByPlaceholder("Monto USD")).toHaveValue("150");
    await expect(page.getByPlaceholder("Monto ARS")).toHaveCount(0);
    await expect(page.getByPlaceholder("Tipo de cambio")).toHaveCount(0);
    await page.getByRole("button", { name: "Cancelar" }).click();

    await createdRow.getByRole("button", { name: "Cobrar" }).click();
    await expect(page.getByPlaceholder("Monto ARS")).toHaveValue("123000");
    await expect(page.getByPlaceholder("Monto USD")).toHaveCount(0);
    await page.getByRole("button", { name: "Cancelar" }).click();

    await page.getByPlaceholder("Buscar concepto…").fill(usdConcept);
    const usdRowForCleanup = page.locator("tr").filter({ hasText: usdConcept });
    await expect(usdRowForCleanup).toHaveCount(1);
    await usdRowForCleanup.getByRole("button", { name: "Elim." }).click();
    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    await expect(usdRowForCleanup).toHaveCount(0);

    await page.reload({ waitUntil: "load" });
    await page.locator("select").first().selectOption("all");
    await page.getByPlaceholder("Buscar concepto…").fill(concept);
    const arsRowForCleanup = page.locator("tr").filter({ hasText: concept });
    await expect(arsRowForCleanup).toHaveCount(1);
    await arsRowForCleanup.getByRole("button", { name: "Elim." }).click();
    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    await expect(arsRowForCleanup).toHaveCount(0);
  });
});
