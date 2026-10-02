import { test, expect } from "@playwright/test";
import { loginAs, loginAsAdmin, loginAsCollaboratorA, loginAsCollaboratorB } from "./auth";

test.describe("Horas V1 - autenticación y permisos", () => {
  test("login muestra copy y permite alternar la contraseña", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("ACCESO INTERNO")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ingresá a Broco" })).toBeVisible();
    await expect(page.getByPlaceholder("nombre@brocosolutions.com")).toBeVisible();
    const password = page.locator("#password");
    await expect(password).toHaveAttribute("type", "password");
    const toggle = page.getByRole("button", { name: "Mostrar contraseña" });
    await toggle.click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "Ocultar contraseña" })).toBeVisible();
    await page.getByRole("button", { name: "Ocultar contraseña" }).click();
    await expect(password).toHaveAttribute("type", "password");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await expect(page.getByRole("button", { name: "Ingresar" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth) + 1);
  });

  test("rechaza credenciales inválidas", async ({ page }) => {
    await page.goto("/login"); await page.getByLabel(/correo/i).fill("admin@test.local"); await page.locator("#password").fill("incorrecta-incorrecta"); await page.getByRole("button", { name: "Ingresar" }).click(); await expect(page.locator("p[role=alert]")).toContainText("incorrectos");
  });

  test("admin ve Tiempos, Reportes y acceso a proyectos dentro de Usuarios", async ({ page }) => {
    await loginAsAdmin(page); await page.goto("/users"); await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible(); await page.goto("/hours/reports"); await expect(page.getByRole("heading", { name: "Reportes" })).toBeVisible();
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
    await expect(entryForm.getByLabel("Horas")).toHaveValue(""); await expect(entryForm.getByLabel("Minutos")).toHaveValue("");
    await page.setViewportSize({ width: 375, height: 812 }); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth) + 1); await page.setViewportSize({ width: 1280, height: 900 });
    await entryForm.getByLabel("Minutos").fill("45"); await entryForm.locator("textarea[name=description]").fill("Carga E2E 45"); await entryForm.getByRole("button", { name: "Guardar", exact: true }).click(); await expect(page.getByRole("status")).toContainText("Registro guardado correctamente"); await expect(page.getByText("Carga E2E 45").last()).toBeVisible(); await expect(page.getByRole("cell", { name: "45 min" }).last()).toBeVisible();
    await entryForm.getByLabel("Horas").fill("1"); await entryForm.getByLabel("Minutos").fill("30"); await entryForm.locator("textarea[name=description]").fill("Carga E2E 1 h 30"); await entryForm.getByRole("button", { name: "Guardar", exact: true }).click(); await expect(page.getByRole("status")).toContainText("Registro guardado correctamente"); await expect(page.getByText("Carga E2E 1 h 30").last()).toBeVisible(); await expect(page.getByRole("cell", { name: "1 h 30 min" }).last()).toBeVisible();
    const workDate = await entryForm.locator('input[name="workDate"]').inputValue();
    const csv = await page.evaluate(async (date) => (await fetch(`/api/hours/export?from=${date}&to=${date}`)).text(), workDate); expect(csv).toContain("Cliente"); expect(csv).toContain("Proyecto"); expect(csv).toContain("45"); expect(csv).not.toContain("Carga B");
  });
});
