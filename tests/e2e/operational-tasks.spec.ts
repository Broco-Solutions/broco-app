import { expect, test } from "@playwright/test";
import { loginAsAdmin, loginAsCollaboratorA } from "./auth";

const uniqueTitle = (prefix: string) => `${prefix} ${Date.now()}`;

test.describe("Tareas operativas V1", () => {
  test("ADMIN crea, bloquea y registra tiempo real para el responsable", async ({ page }) => {
    const title = uniqueTitle("Tarea E2E admin");

    await loginAsAdmin(page);
    await page.goto("/tasks");
    await expect(page.getByRole("heading", { name: "Tareas", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "+ Nueva tarea" }).click();

    const createForm = page.getByRole("heading", { name: "Nueva tarea" }).locator("xpath=ancestor::form");
    await createForm.getByLabel(/Título/).fill(title);
    await createForm.getByRole("button", { name: "Responsable *" }).click();
    await createForm.getByRole("option", { name: "Colaborador A Test" }).click();
    await createForm.getByRole("button", { name: "Sin proyecto" }).click();
    await createForm.getByRole("option", { name: "Horas Test Cliente A · Horas Test Proyecto A1" }).click();
    await createForm.getByLabel("Descripción").fill("Descripción extensa para validar el detalle operativo.");
    await createForm.getByRole("button", { name: "Crear tarea" }).click();

    const row = page.getByRole("button", { name: `Abrir tarea ${title}` });
    await expect(row).toBeVisible();
    await row.click();
    const detail = page.getByRole("dialog", { name: title });
    await expect(detail.getByText("Horas Test Cliente A · Horas Test Proyecto A1")).toBeVisible();
    await expect(detail.getByText("Descripción extensa para validar el detalle operativo.")).toBeVisible();

    await detail.getByRole("button", { name: "Bloqueada" }).click();
    await detail.getByText("¿Qué necesitás para continuar?").locator("xpath=..").getByRole("textbox").fill("Necesito validación del cliente.");
    await detail.getByRole("button", { name: "Guardar bloqueo" }).click();
    await expect(detail.getByText("Motivo de bloqueo")).toBeVisible();
    await expect(detail.getByText("Necesito validación del cliente.")).toBeVisible();

    await detail.getByRole("button", { name: "Registrar tiempo" }).click();
    const timeForm = page.getByRole("heading", { name: "Registrar tiempo" }).locator("xpath=ancestor::form");
    await timeForm.getByLabel("Minutos").fill("25");
    await timeForm.getByLabel("Detalle adicional").fill("Revisión inicial");
    await timeForm.getByRole("button", { name: "Registrar tiempo" }).click();
    await expect(detail.getByText("25 min").first()).toBeVisible();
    await expect(detail.getByText(`${title} — Revisión inicial`)).toBeVisible();
  });

  test("COLLABORATOR ve sólo la experiencia propia y crea una tarea sin selector de responsable", async ({ page }) => {
    const title = uniqueTitle("Tarea E2E colaborador");

    await loginAsCollaboratorA(page);
    await page.goto("/tasks");
    await expect(page.getByRole("heading", { name: "Mis tareas" })).toBeVisible();

    const navigationLabels = (await page.locator("aside nav a").allTextContents()).map((label) => label.trim());
    expect(navigationLabels.indexOf("Tareas")).toBeGreaterThanOrEqual(0);
    expect(navigationLabels.indexOf("Tareas")).toBeLessThan(navigationLabels.indexOf("Tiempos"));
    await expect(page.getByRole("link", { name: "Ingresos" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Gastos" })).toHaveCount(0);

    await page.getByRole("button", { name: "+ Nueva tarea" }).click();
    const createForm = page.getByRole("heading", { name: "Nueva tarea" }).locator("xpath=ancestor::form");
    await expect(createForm.getByText("Responsable", { exact: true })).toHaveCount(0);
    await createForm.getByLabel(/Título/).fill(title);
    await createForm.getByRole("button", { name: "Sin proyecto" }).click();
    await expect(createForm.getByRole("option", { name: "Horas Test Cliente A · Horas Test Proyecto A1" })).toBeVisible();
    await expect(createForm.getByRole("option", { name: "Horas Test Cliente B · Horas Test Proyecto B1" })).toHaveCount(0);
    await createForm.getByRole("option", { name: "Horas Test Cliente A · Horas Test Proyecto A1" }).click();
    await createForm.getByRole("button", { name: "Crear tarea" }).click();

    await expect(page.getByRole("button", { name: `Abrir tarea ${title}` })).toBeVisible();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await expect(page.locator(".md\\:hidden").getByText(title, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => document.documentElement.clientWidth) + 1,
    );
    await page.goto("/incomes");
    await expect(page).toHaveURL(/\/hours$/);
  });
});
