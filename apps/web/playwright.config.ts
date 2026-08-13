import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "pnpm dev",
    // Rota concreta, não a raiz: o gate de prontidão do Playwright só aceita 2xx/3xx,
    // e "/" não tem página — responderia 404 para sempre e o servidor nunca ficaria "pronto".
    url: "http://localhost:3000/cadastrar",
    reuseExistingServer: true,
  },
});
