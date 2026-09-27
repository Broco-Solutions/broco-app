import type { Page } from "@playwright/test";

export const E2E_PASSWORD = process.env.HOURS_TEST_PASSWORD ?? "";
export async function loginAs(page: Page, email: string) {
  if (!E2E_PASSWORD) throw new Error("HOURS_TEST_PASSWORD es obligatoria para E2E.");
  await page.goto("http://localhost:3299/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}
export const loginAsAdmin = (page: Page) => loginAs(page, "admin@test.local");
export const loginAsCollaboratorA = (page: Page) => loginAs(page, "dev-a@test.local");
export const loginAsCollaboratorB = (page: Page) => loginAs(page, "dev-b@test.local");
