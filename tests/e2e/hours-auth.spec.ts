import { test, expect } from "@playwright/test";
import { loginAs, loginAsAdmin, loginAsCollaboratorA, loginAsCollaboratorB } from "./auth";

test.describe("Horas V1 - autenticación y permisos", () => {
  test("rechaza credenciales inválidas", async ({ page }) => {
    await page.goto("/login"); await page.getByLabel("Correo").fill("admin@test.local"); await page.getByLabel("Contraseña").fill("incorrecta-incorrecta"); await page.getByRole("button", { name: "Ingresar" }).click(); await expect(page.locator("p[role=alert]")).toContainText("incorrectos");
  });

  test("admin ve Tiempos, Reportes y Asignaciones", async ({ page }) => {
    await loginAsAdmin(page); await page.goto("/hours/team"); await expect(page.getByRole("heading", { name: "Asignaciones" })).toBeVisible(); await page.goto("/hours/reports"); await expect(page.getByRole("heading", { name: "Reportes" })).toBeVisible();
  });

  test("colaborador A entra a sus horas y no a finanzas", async ({ page }) => {
    await loginAsCollaboratorA(page); await expect(page).toHaveURL(/\/hours/); await expect(page.getByRole("link", { name: "Tiempos" })).toBeVisible(); await expect(page.getByText("Reportes", { exact: true })).toHaveCount(0); await expect(page.getByText("Ingresos")).toHaveCount(0); await page.goto("/incomes"); await expect(page).toHaveURL(/\/hours/);
  });

  test("colaboradores trabajan en proyectos separados", async ({ page }) => {
    await loginAsCollaboratorA(page); await page.getByRole("button", { name: "Seleccionar cliente" }).click(); await page.getByRole("option", { name: "Horas Test Cliente A" }).click(); await page.getByRole("button", { name: "Seleccionar proyecto" }).click(); await expect(page.getByRole("option", { name: "Horas Test Proyecto A1" })).toBeVisible(); await expect(page.getByRole("option", { name: "Horas Test Proyecto B1" })).toHaveCount(0);
    await page.getByRole("button", { name: "Salir" }).click(); await loginAsCollaboratorB(page); await page.getByRole("button", { name: "Seleccionar cliente" }).click(); await page.getByRole("option", { name: "Horas Test Cliente B" }).click(); await page.getByRole("button", { name: "Seleccionar proyecto" }).click(); await expect(page.getByRole("option", { name: "Horas Test Proyecto B1" })).toBeVisible();
  });

  test("admin puede autenticarse con el flujo real de Auth.js", async ({ page }) => {
    await loginAs(page, "admin@test.local"); await page.goto("/hours"); await expect(page.getByRole("heading", { name: "Registros", exact: true })).toBeVisible();
  });

  test("colaborador ve sus indicadores, carga tiempos y exporta su scope", async ({ page }) => {
    await loginAsCollaboratorA(page);
    await expect(page.getByText("Horas registradas")).toBeVisible();
    await page.goto("/hours/reports"); await expect(page).toHaveURL(/\/hours$/); await page.goto("/hours");
    const entryForm = page.locator("form").filter({ has: page.locator("input[name=operationId]") });
    await page.getByRole("button", { name: "Seleccionar cliente" }).click(); await page.getByRole("option", { name: "Horas Test Cliente A" }).click();
    await page.getByRole("button", { name: "Seleccionar proyecto" }).click(); await page.getByRole("option", { name: "Horas Test Proyecto A1" }).click();
    await entryForm.locator("input[name=duration]").fill("45"); await entryForm.locator("textarea[name=description]").fill("Carga E2E 45"); await entryForm.getByRole("button", { name: "Guardar", exact: true }).click(); await expect(page.getByRole("status")).toContainText("Registro guardado correctamente"); await expect(page.getByText("Carga E2E 45").last()).toBeVisible(); await expect(page.getByRole("cell", { name: "45 min" }).last()).toBeVisible();
    await entryForm.locator("select[name=unit]").selectOption("HOURS"); await entryForm.locator("input[name=duration]").fill("1,5"); await entryForm.locator("textarea[name=description]").fill("Carga E2E 1,5"); await expect(page.getByText("Equivalencia: 1 h 30 min")).toBeVisible(); await expect(entryForm.getByRole("button", { name: "Guardar", exact: true })).toBeEnabled(); await entryForm.getByRole("button", { name: "Guardar", exact: true }).click(); await expect(page.getByRole("status")).toContainText("Registro guardado correctamente"); await expect(page.getByText("Carga E2E 1,5").last()).toBeVisible();
    const csv = await page.evaluate(async () => (await fetch("/api/hours/export?from=2026-09-27&to=2026-09-27")).text()); expect(csv).toContain("Cliente"); expect(csv).toContain("Proyecto"); expect(csv).toContain("45"); expect(csv).not.toContain("Carga B");
  });
});
