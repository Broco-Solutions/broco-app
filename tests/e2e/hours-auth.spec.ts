import { test, expect } from "@playwright/test";
import { loginAs, loginAsAdmin, loginAsCollaboratorA, loginAsCollaboratorB } from "./auth";

test.describe("Horas V1 - autenticación y permisos", () => {
  test("rechaza credenciales inválidas", async ({ page }) => {
    await page.goto("/login"); await page.getByLabel("Correo").fill("admin@test.local"); await page.getByLabel("Contraseña").fill("incorrecta-incorrecta"); await page.getByRole("button", { name: "Ingresar" }).click(); await expect(page.locator("p[role=alert]")).toContainText("incorrectos");
  });

  test("admin ve Equipo, Horas y Reportes", async ({ page }) => {
    await loginAsAdmin(page); await page.goto("/hours/team"); await expect(page.getByRole("heading", { name: "Equipo" })).toBeVisible(); await page.goto("/hours/reports"); await expect(page.getByRole("heading", { name: "Reportes" })).toBeVisible();
  });

  test("colaborador A entra a sus horas y no a finanzas", async ({ page }) => {
    await loginAsCollaboratorA(page); await expect(page).toHaveURL(/\/hours/); await expect(page.getByText("Ingresos")).toHaveCount(0); await page.goto("/incomes"); await expect(page).toHaveURL(/\/hours/);
  });

  test("colaboradores trabajan en proyectos separados", async ({ page }) => {
    await loginAsCollaboratorA(page); await page.getByRole("button", { name: "Seleccionar cliente" }).click(); await page.getByRole("button", { name: "Horas Test Cliente A" }).click(); await page.getByRole("button", { name: "Seleccionar proyecto" }).click(); await expect(page.getByRole("button", { name: "Horas Test Proyecto A1" })).toBeVisible(); await expect(page.getByRole("button", { name: "Horas Test Proyecto B1" })).toHaveCount(0);
    await page.getByRole("button", { name: "Salir" }).click(); await loginAsCollaboratorB(page); await page.getByRole("button", { name: "Seleccionar cliente" }).click(); await page.getByRole("button", { name: "Horas Test Cliente B" }).click(); await page.getByRole("button", { name: "Seleccionar proyecto" }).click(); await expect(page.getByRole("button", { name: "Horas Test Proyecto B1" })).toBeVisible();
  });

  test("admin puede autenticarse con el flujo real de Auth.js", async ({ page }) => {
    await loginAs(page, "admin@test.local"); await page.goto("/hours"); await expect(page.getByRole("heading", { name: "Registros" })).toBeVisible();
  });

  test("colaborador carga 45 minutos y 1,5 horas, y exporta su scope", async ({ page }) => {
    await loginAsCollaboratorA(page);
    await page.getByRole("button", { name: "Seleccionar cliente" }).click(); await page.getByRole("button", { name: "Horas Test Cliente A" }).click();
    await page.getByRole("button", { name: "Seleccionar proyecto" }).click(); await page.getByRole("button", { name: "Horas Test Proyecto A1" }).click();
    await page.locator("input[name=duration]").fill("45"); await page.locator("textarea[name=description]").fill("Carga E2E 45"); await page.getByRole("button", { name: "Guardar", exact: true }).click(); await expect(page.getByText("Carga E2E 45").first()).toBeVisible(); await expect(page.getByRole("cell", { name: "45 min" }).last()).toBeVisible();
    await page.locator("select[name=unit]").selectOption("HOURS"); await page.locator("input[name=duration]").fill("1,5"); await page.locator("textarea[name=description]").fill("Carga E2E 1,5"); await expect(page.getByText("Equivalencia: 1 h 30 min")).toBeVisible(); await page.getByRole("button", { name: "Guardar", exact: true }).click(); await expect(page.getByText("Carga E2E 1,5").first()).toBeVisible();
    const csv = await page.evaluate(async () => (await fetch("/api/hours/export?from=2026-09-27&to=2026-09-27")).text()); expect(csv).toContain("Cliente"); expect(csv).toContain("Proyecto"); expect(csv).toContain("45"); expect(csv).not.toContain("Carga B");
  });
});
