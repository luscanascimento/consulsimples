import { expect, test, type Page } from "@playwright/test";

// Conta criada uma vez pelo global-setup e reaproveitada: o e2e roda contra a API de verdade.
const EMAIL = process.env.E2E_EMAIL!;
const PASSWORD = "senha-bem-comprida";

// O overlay de desenvolvimento do Next injeta um role="alert" vazio fora do <main>, e o
// Playwright atravessa shadow DOM: `page.getByRole("alert").first()` ora pega o nosso, ora
// o dele. Recortar no <main> mede a mensagem que o usuário lê, e só ela.
const alertText = (page: Page) => page.locator("main").getByRole("alert").first().textContent();

test.describe("login", () => {
  test("redirects to the login screen when there is no session", async ({ page }) => {
    await page.goto("/cardapio");
    await expect(page).toHaveURL(/\/entrar/);
  });

  test("shows the same message for wrong password and unknown email", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("Email").fill("ninguem@bar.com");
    await page.getByLabel("Senha").fill("senha-errada-longa");
    await page.getByRole("button", { name: "Entrar" }).click();
    const first = await alertText(page);

    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Senha").fill("outra-senha-errada");
    await page.getByRole("button", { name: "Entrar" }).click();
    const second = await alertText(page);

    expect(first).toBe(second);
    // A mensagem tem que existir: dois vazios iguais não provariam nada.
    expect(first).toBe("Email ou senha inválidos.");
  });

  test("never exposes the token to javascript", async ({ page, context }) => {
    await page.goto("/entrar");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Senha").fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/cardapio/);

    // document.cookie não enxerga cookie HttpOnly.
    expect(await page.evaluate(() => document.cookie)).not.toContain("__Host-at");
    expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe("{}");

    // O cookie existe, mas só para o servidor.
    const cookies = await context.cookies();
    const access = cookies.find((c) => c.name === "__Host-at");
    expect(access?.httpOnly).toBe(true);
  });

  test("logout clears the session and blocks the back button", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Senha").fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/cardapio/);

    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/entrar/);

    await page.goto("/cardapio");
    await expect(page).toHaveURL(/\/entrar/);
  });
});
