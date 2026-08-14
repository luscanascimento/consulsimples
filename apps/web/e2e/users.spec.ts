import { expect, test } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL!;
const PASSWORD = "senha-bem-comprida";

test.beforeEach(async ({ page }) => {
  await page.goto("/entrar");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  // Esperar o destino do login antes de navegar: sem isso o goto corre contra a
  // Server Action que grava o cookie e cai de volta na tela de entrar.
  await expect(page).toHaveURL(/\/cardapio/);
  await page.goto("/usuarios");
});

test("lists users and creates a waiter", async ({ page }) => {
  const email = `garcom-${Date.now()}@bar.com`;
  await page.getByRole("button", { name: /novo usuário/i }).click();
  await page.getByLabel("Nome").fill("Garçom");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill("senha-bem-comprida");
  await page.getByLabel("Papel").selectOption("WAITER");
  await page.getByRole("button", { name: "Salvar" }).click();

  await expect(page.getByRole("cell", { name: email })).toBeVisible();
});

// A regra do último dono (USER_002) é do servidor e precisa aparecer na tela. Desativar
// a si mesmo não tem botão — de propósito —, então o caminho que resta para o único dono
// é o rebaixamento de papel. A contagem antes garante que ele é mesmo o último.
test("shows the server error when demoting the last owner", async ({ page }) => {
  await expect(page.getByRole("row").filter({ hasText: "Dono" })).toHaveCount(1);

  const row = page.getByRole("row").filter({ hasText: "Dono" }).first();
  await row.getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Papel").selectOption("WAITER");
  await page.getByRole("button", { name: "Salvar" }).click();

  await expect(page.getByRole("alert").filter({ hasText: /dono ativo/i })).toBeVisible();
});

test("never renders a password hash", async ({ page }) => {
  await expect(page.locator("body")).not.toContainText("$argon2id$");
});

test("keeps the table readable at 1280x720", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.reload();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
