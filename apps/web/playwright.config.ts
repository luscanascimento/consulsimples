import { defineConfig } from "@playwright/test";

// Valor fixo, não `Date.now()`: o config é carregado de novo em cada worker, e um email
// gerado na hora daria uma conta diferente por processo — o global-setup semearia uma e os
// testes tentariam entrar em outra. Quem quiser isolar uma execução passa E2E_EMAIL por fora.
process.env.E2E_EMAIL ??= "e2e@bar.com";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "pnpm dev",
    // Rota concreta, não a raiz: o gate de prontidão do Playwright só aceita 2xx/3xx,
    // e "/" só existe atrás da sessão — responderia redirect para o login, não a página.
    url: "http://localhost:3000/cadastrar",
    reuseExistingServer: true,
  },
});
