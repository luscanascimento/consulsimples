import { expect, test } from "@playwright/test";

test("reaches the recovery screen from the login page", async ({ page }) => {
  await page.goto("/entrar");
  await page.getByRole("link", { name: /esqueci minha senha/i }).click();
  await expect(page).toHaveURL(/\/esqueci-senha/);
});

test("shows the same confirmation for a known and an unknown email", async ({ page }) => {
  await page.goto("/esqueci-senha");
  await page.getByLabel("Email").fill(process.env.E2E_EMAIL!);
  await page.getByRole("button", { name: "Enviar link" }).click();
  const known = await page.getByRole("status").textContent();

  await page.goto("/esqueci-senha");
  // Email novo a cada execução: o rate limit é por ip:email (3/h), e reusar um endereço
  // fixo faria a segunda rodada bater em 429 e o teste falhar por cota, não por bug.
  await page.getByLabel("Email").fill(`nao-existe-${Date.now()}@bar.com`);
  await page.getByRole("button", { name: "Enviar link" }).click();
  const unknown = await page.getByRole("status").textContent();

  // A tela não pode revelar se a conta existe.
  expect(known).toBe(unknown);
});

test("refuses an invalid reset token with a clear message", async ({ page }) => {
  await page.goto("/redefinir-senha?token=token-que-nao-existe");
  await page.getByLabel("Nova senha").fill("senha-nova-bem-longa");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  // .first(): o Next injeta um <div role="alert"> vazio como route announcer, então o
  // papel sozinho é ambíguo. O primeiro alerta da página é o da aplicação.
  await expect(page.getByRole("alert").first()).toContainText(/inválido ou expirado/i);
});

test("shows a field error for a password shorter than 12 characters", async ({ page }) => {
  await page.goto("/redefinir-senha?token=qualquer-token-aqui");
  await page.getByLabel("Nova senha").fill("curta");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();

  const input = page.getByLabel("Nova senha");
  await expect(input).toHaveAttribute("aria-invalid", "true");
});

test("explains what to do when the link has no token", async ({ page }) => {
  await page.goto("/redefinir-senha");
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /pedir um novo link/i })).toBeVisible();
});

test("works at 360x740", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/esqueci-senha");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await expect(page.getByRole("button", { name: "Enviar link" })).toBeVisible();
});
