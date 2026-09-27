import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./auth";

const BASE = "http://localhost:3299";

test.describe("Integration flows", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  // --- Flujo A: new client appears in project selector ---

  test("Flujo A — new client appears in project selector", async ({ page }) => {
    const clientName = `A-${Date.now()}`;

    await page.goto(BASE + "/clients", { waitUntil: "load" });
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    await page.getByPlaceholder("Nombre").fill(clientName);
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.waitForTimeout(2500);

    await page.goto(BASE + "/projects", { waitUntil: "load" });
    await page.getByRole("button", { name: "Nuevo proyecto" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo proyecto" })).toBeVisible({ timeout: 5000 });

    // The first select in the modal is the client selector
    const selects = page.locator("select");
    // Get all select option texts from the form modal
    // The modal has a select for client. There's also the filter select outside.
    // Get all options from all selects and check if clientName is among them
    const count = await selects.count();
    let found = false;
    for (let i = 0; i < count; i++) {
      const sel = selects.nth(i);
      const opts = await sel.locator("option").allTextContents();
      if (opts.some((o) => o.includes(clientName))) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);

    await page.getByRole("button", { name: "Cancelar" }).click();
  });

  // --- Flujo B: create project from client detail ---

  test("Flujo B — create project from client detail page", async ({ page }) => {
    const clientName = `B-${Date.now()}`;
    await page.goto(BASE + "/clients", { waitUntil: "load" });
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    await page.getByPlaceholder("Nombre").fill(clientName);
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.waitForTimeout(2500);

    await page.goto(BASE + "/clients", { waitUntil: "load" });
    await page.getByRole("link", { name: clientName }).first().click();
    await page.waitForLoadState("load");

    await page.getByRole("button", { name: "Nuevo proyecto" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo proyecto" })).toBeVisible({ timeout: 5000 });
    await expect(page.locator("select").first()).not.toHaveValue("");

    const projectName = `Proj-${Date.now()}`;
    await page.getByPlaceholder("Nombre").fill(projectName);
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.waitForTimeout(3000);

    await expect(page.getByText(projectName).first()).toBeVisible({ timeout: 5000 });
    await page.goto(BASE + "/projects", { waitUntil: "load" });
    await expect(page.getByText(projectName).first()).toBeVisible({ timeout: 5000 });
  });

  // --- Flujo C: regressions ---

  test("Flujo C — client create + edit regression", async ({ page }) => {
    const name = `C1-${Date.now()}`;
    await page.goto(BASE + "/clients", { waitUntil: "load" });
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    await page.getByPlaceholder("Nombre").fill(name);
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.waitForTimeout(2500);

    await page.goto(BASE + "/clients", { waitUntil: "load" });
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "Editar" }).first().click();
    await expect(page.getByRole("heading", { name: "Editar cliente" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByPlaceholder("Nombre")).not.toHaveValue("");
    await page.getByRole("button", { name: "Cancelar" }).click();
  });

  test("Flujo C — project create + edit regression", async ({ page }) => {
    const name = `C2-${Date.now()}`;

    await page.goto(BASE + "/projects", { waitUntil: "load" });
    await page.getByRole("button", { name: "Nuevo proyecto" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo proyecto" })).toBeVisible({ timeout: 5000 });

    // The modal select is rendered inside ModalPortal (appended to body),
    // so it appears AFTER the filter select in DOM order. Use last().
    const select = page.locator("select").last();
    await select.selectOption({ index: 1 });
    await page.getByPlaceholder("Nombre").fill(name);
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.waitForTimeout(3000);

    await page.goto(BASE + "/projects", { waitUntil: "load" });
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "Editar" }).first().click();
    await expect(page.getByRole("heading", { name: "Editar proyecto" })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Cancelar" }).click();
  });

  test("Flujo C — modals multiple times", async ({ page }) => {
    await page.goto(BASE + "/projects", { waitUntil: "load" });

    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Nuevo proyecto" }).click();
      await expect(page.getByRole("heading", { name: "Nuevo proyecto" })).toBeVisible({ timeout: 5000 });
      await page.getByRole("button", { name: "Cancelar" }).click();
      await expect(page.getByRole("heading", { name: "Nuevo proyecto" })).not.toBeVisible({ timeout: 5000 });
    }
  });
});
