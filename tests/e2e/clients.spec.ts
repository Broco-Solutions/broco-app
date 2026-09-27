import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./auth";

const BASE = "http://localhost:3299";

test.describe("Clientes CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Nuevo cliente button opens modal directly", async ({ page }) => {
    await page.goto(BASE + "/clients");
    await page.waitForLoadState("load");

    // Click the button
    await page.getByRole("button", { name: "Nuevo cliente" }).click();

    // Check the modal heading
    const modalHeading = page.getByRole("heading", { name: "Nuevo cliente" });
    await expect(modalHeading).toBeVisible({ timeout: 5000 });
  });

  test("create client and verify in table", async ({ page }) => {
    await page.goto(BASE + "/clients");
    await page.waitForLoadState("load");

    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo cliente" })).toBeVisible({ timeout: 5000 });

    await page.getByPlaceholder("Nombre").fill("Cliente E2E Test");

    await page.getByRole("button", { name: "Guardar" }).click();

    // Wait for page reload
    await page.waitForTimeout(2000);

    await expect(page.getByText("Cliente E2E Test").first()).toBeVisible({ timeout: 5000 });
  });

  test("cancel closes modal", async ({ page }) => {
    await page.goto(BASE + "/clients");
    await page.waitForLoadState("load");

    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    const heading = page.getByRole("heading", { name: "Nuevo cliente" });
    await expect(heading).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "Cancelar" }).click();

    await expect(heading).not.toBeVisible({ timeout: 5000 });
  });

  test("close with backdrop closes modal", async ({ page }) => {
    await page.goto(BASE + "/clients");
    await page.waitForLoadState("load");

    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    const heading = page.getByRole("heading", { name: "Nuevo cliente" });
    await expect(heading).toBeVisible({ timeout: 5000 });

    // Click the backdrop outside the modal card (top-left corner of viewport)
    await page.mouse.click(10, 10);

    await expect(heading).not.toBeVisible({ timeout: 5000 });
  });

  test("edit client preloads fields", async ({ page }) => {
    await page.goto(BASE + "/clients");
    await page.waitForLoadState("load");

    const editBtn = page.getByRole("button", { name: "Editar" }).first();
    if (await editBtn.isVisible()) {
      await editBtn.click();

      await expect(page.getByRole("heading", { name: "Editar cliente" })).toBeVisible({ timeout: 5000 });

      const nameInput = page.getByPlaceholder("Nombre");
      await expect(nameInput).not.toHaveValue("");

      await page.getByRole("button", { name: "Cancelar" }).click();
      await expect(page.getByRole("heading", { name: "Editar cliente" })).not.toBeVisible({ timeout: 5000 });
    }
  });

  test("open modal multiple times works", async ({ page }) => {
    await page.goto(BASE + "/clients");
    await page.waitForLoadState("load");

    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Nuevo cliente" }).click();
      await expect(page.getByRole("heading", { name: "Nuevo cliente" })).toBeVisible({ timeout: 3000 });
      await page.getByRole("button", { name: "Cancelar" }).click();
      await expect(page.getByRole("heading", { name: "Nuevo cliente" })).not.toBeVisible({ timeout: 3000 });
    }
  });
});
