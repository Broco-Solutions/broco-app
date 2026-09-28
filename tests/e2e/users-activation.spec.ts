import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./auth";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test.describe("Activación de usuarios", () => {
  test("admin genera y copia el enlace; la persona ve su cuenta", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/users");

    const suffix = Date.now();
    const name = `Activación UX ${suffix}`;
    const email = `activation-ux-${suffix}@test.local`;
    await page.getByPlaceholder("Nombre").fill(name);
    await page.getByPlaceholder("Correo").fill(email);
    await page.getByRole("button", { name: "Agregar usuario" }).click();
    await page.waitForLoadState("networkidle");

    const userCard = page.getByRole("heading", { name, exact: true }).locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]");
    await expect(userCard).toBeVisible();
    await userCard.getByRole("button", { name: "Generar enlace de activación" }).click();
    const link = userCard.getByLabel(/Enlace de activación/);
    const activationUrl = await link.inputValue();
    expect(activationUrl).toMatch(/\/hours\/activate\?token=/);

    await userCard.getByRole("button", { name: "Copiar enlace" }).click();
    await expect(userCard.getByRole("button", { name: "Enlace copiado" })).toBeVisible();

    await page.goto(activationUrl);
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    const password = page.getByLabel("NUEVA CONTRASEÑA");
    await password.fill("corta");
    expect(await password.evaluate((element) => (element as HTMLInputElement).validity.tooShort)).toBe(true);
  });

  test("enlace inválido muestra una salida clara", async ({ page }) => {
    await page.goto("/hours/activate?token=invalid-ui-token");
    await expect(page.getByRole("heading", { name: "Este enlace ya no es válido" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Volver al inicio de sesión" })).toBeVisible();
  });
});
