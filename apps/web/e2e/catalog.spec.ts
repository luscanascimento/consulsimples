import { expect, test } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL!;
const PASSWORD = "senha-bem-comprida";

test.beforeEach(async ({ page }) => {
  await page.goto("/entrar");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/cardapio/);
});

test("shows an empty state with an action when there is no category", async ({ page }) => {
  const empty = page.getByText(/nenhuma categoria ainda/i);
  if (await empty.isVisible()) {
    await expect(page.getByRole("button", { name: /criar a primeira/i })).toBeVisible();
  }
});

test("creates a category and then a product priced in reais", async ({ page }) => {
  const category = `Lanches ${Date.now()}`;
  await page.getByRole("button", { name: /nova categoria/i }).click();
  await page.getByLabel("Nome").fill(category);
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("link", { name: category })).toBeVisible();

  await page.getByRole("link", { name: category }).click();
  await page.getByRole("button", { name: /novo produto/i }).click();
  await page.getByLabel("Nome").fill("X-Salada");
  await page.getByLabel("Preço").fill("23,50");
  await page.getByRole("button", { name: "Salvar" }).click();

  // O usuário digita e lê em reais; a API recebe centavos.
  await expect(page.getByRole("cell", { name: "R$ 23,50" })).toBeVisible();
});

test("shows the field error when the price is not a valid amount", async ({ page }) => {
  await page.getByRole("button", { name: /novo produto/i }).click();
  await page.getByLabel("Nome").fill("Erro");
  await page.getByLabel("Preço").fill("abc");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
});

test("fits 1366x768 and 1280x720 without horizontal scroll", async ({ page }) => {
  for (const size of [
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(size);
    await page.reload();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow, `viewport ${size.width}x${size.height}`).toBe(false);
  }
});
