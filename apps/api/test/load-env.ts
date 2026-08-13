import { existsSync } from "node:fs";

// Node 22 carrega .env nativamente — sem dependência de dotenv.
// Roda como `globalSetup`: `setupFiles` executa no sandbox do jest, onde `loadEnvFile` escreve
// no process real e não no `process.env` copiado que o teste enxerga.
// Em CI não existe arquivo: as variáveis vêm do ambiente do job.
export default function loadEnv() {
  for (const file of [".env.test", ".env"]) {
    if (existsSync(file)) {
      process.loadEnvFile(file);
      return;
    }
  }
}
