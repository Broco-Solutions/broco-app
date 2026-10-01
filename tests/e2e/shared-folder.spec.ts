import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./auth";

const BASE = "http://localhost:3299";

test.describe("Shared project folder link", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("admin configura la carpeta, el cliente la ve en el portal y al quitarla desaparece", async ({
    page,
  }) => {
    const suffix = Date.now();
    const clientName = `FolderClient-${suffix}`;
    const projectName = `FolderProject-${suffix}`;
    const folderLabel = `Documentación ${suffix}`;

    // 1. Crear cliente
    await page.goto(BASE + "/clients", { waitUntil: "load" });
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    await page.getByPlaceholder("Nombre").fill(clientName);
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByRole("link", { name: clientName })).toBeVisible();

    // 2. Crear proyecto
    await page.goto(BASE + "/projects", { waitUntil: "load" });
    await page.getByRole("button", { name: "Nuevo proyecto" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo proyecto" })).toBeVisible({
      timeout: 5000,
    });
    const projectForm = page.getByRole("heading", { name: "Nuevo proyecto" }).locator("xpath=..").locator("form");
    await projectForm.locator("select").selectOption({ label: clientName });
    await page.getByPlaceholder("Nombre").fill(projectName);
    await projectForm.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByRole("link", { name: projectName })).toBeVisible();

    // 3. Ir a Planificación
    await page.goto(BASE + "/projects", { waitUntil: "load" });
    await page.getByRole("link", { name: projectName }).first().click();
    await page.waitForLoadState("load");
    await page.getByRole("link", { name: "Planificación" }).click();
    await page.waitForLoadState("load");

    // 4. Guardar carpeta compartida
    const urlInput = page.getByPlaceholder("https://drive.google.com/drive/folders/...");
    await expect(urlInput).toBeVisible({ timeout: 5000 });
    await urlInput.fill(
      `https://drive.google.com/drive/folders/1NskSnUyMgMOkbVMb9xJ6oNT9xWi-jrGP?usp=drive_link&r=${suffix}`,
    );
    await page.getByPlaceholder("Abrir carpeta compartida").fill(folderLabel);
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText(folderLabel).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("link", { name: "Abrir" })).toBeVisible();

    // 5. Configurar acceso del cliente y obtener slug + password
    await page.getByRole("button", { name: "Configurar acceso" }).click();
    await expect(page.getByText("Copiar enlace")).toBeVisible({ timeout: 5000 });
    const shareUrl = (await page.locator('a[target="_blank"][href*="/p/"]').getAttribute("href")) ?? "";
    const slug = shareUrl.trim().split("/").pop() ?? "";
    expect(slug.length).toBeGreaterThan(0);

    const passwordCode = page.locator("code").first();
    if (((await passwordCode.textContent()) ?? "").includes("•")) {
      await page.getByRole("button", { name: "Ver" }).click();
      await expect(page.getByRole("button", { name: "Ocultar" })).toBeVisible();
    }
    const password = ((await passwordCode.textContent()) ?? "").trim();
    expect(password).not.toContain("•");
    expect(password.length).toBeGreaterThan(0);

    // 6. Cliente entra al portal y ve la tarjeta con el texto configurado
    await page.goto(`${BASE}/p/${slug}`, { waitUntil: "load" });
    await page.getByPlaceholder("Contraseña").fill(password);
    await page.getByRole("button", { name: "Acceder" }).click();
    await expect(page.getByRole("heading", { name: "Documentación del proyecto" })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText(folderLabel).first()).toBeVisible();

    // 7. Administrador quita la carpeta
    await page.goto(BASE + "/projects", { waitUntil: "load" });
    await page.getByRole("link", { name: projectName }).first().click();
    await page.waitForLoadState("load");
    await page.getByRole("link", { name: "Planificación" }).click();
    await page.waitForLoadState("load");
    await page.getByRole("button", { name: "Quitar" }).click();
    await page.getByRole("heading", { name: "Quitar carpeta compartida" }).waitFor();
    await page.locator("button.bg-brick").filter({ hasText: "Quitar" }).click();
    await page.waitForTimeout(2000);

    // 8. La tarjeta desaparece del portal (cookie portal_session persiste)
    await page.goto(`${BASE}/p/${slug}`, { waitUntil: "load" });
    await expect(
      page.getByRole("heading", { name: "Documentación del proyecto" }),
    ).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText(folderLabel)).not.toBeVisible();
    // Sin bloque vacío entre métricas y cronograma: la tarjeta no existe
    await expect(
      page.locator('a[href*="drive.google.com"]'),
    ).toHaveCount(0);
  });
});
