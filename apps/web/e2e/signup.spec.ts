import { expect, test } from "@playwright/test";

test.describe("signup", () => {
  test("shows field errors without leaving the page", async ({ page }) => {
    await page.goto("/cadastrar");
    await page.getByLabel("Nome do restaurante").fill("A");
    await page.getByLabel("Seu nome").fill("José");
    await page.getByLabel("Email").fill("nao-e-email");
    await page.getByLabel("Senha").fill("curta");
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(page).toHaveURL(/\/cadastrar/);
    // Recortado no <main>: o overlay de desenvolvimento do Next injeta um role="alert"
    // vazio fora dele, e sem o recorte o teste passaria olhando para o alerta errado.
    await expect(page.locator("main").getByRole("alert").first()).toBeVisible();
  });

  test("links each error message to its input", async ({ page }) => {
    await page.goto("/cadastrar");
    await page.getByLabel("Senha").fill("curta");
    await page.getByRole("button", { name: "Criar conta" }).click();

    const input = page.getByLabel("Senha");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = await input.getAttribute("aria-describedby");
    expect(describedBy).toContain("password-error");
  });

  test("creates the account and lands on the confirmation screen", async ({ page }) => {
    const email = `teste-${Date.now()}@bar.com`;
    await page.goto("/cadastrar");
    await page.getByLabel("Nome do restaurante").fill("Bar do Playwright");
    await page.getByLabel("Seu nome").fill("José");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Senha").fill("senha-bem-comprida");
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(page).toHaveURL(/\/confirme-seu-email/);
    await expect(page.getByText(/confirme seu email/i)).toBeVisible();
  });

  test("works at 360x740", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/cadastrar");
    // Nenhum scroll horizontal: a largura do documento não passa da viewport.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    await expect(page.getByRole("button", { name: "Criar conta" })).toBeVisible();
  });
});
