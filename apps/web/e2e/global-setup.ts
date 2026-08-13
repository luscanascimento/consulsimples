import { execFileSync } from "node:child_process";

export default async function globalSetup() {
  const email = process.env.E2E_EMAIL!;
  // Signup é idempotente por fora: email repetido devolve o mesmo 201 vazio, de propósito
  // (não vira oráculo de enumeração). Rodar de novo com a conta já criada é inofensivo.
  await fetch("http://localhost:3001/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      restaurantName: "Bar do E2E",
      ownerName: "E2E",
      email,
      password: "senha-bem-comprida",
    }),
  });

  // O e2e roda contra um banco de teste: ativar direto é aceitável aqui e só aqui — o link
  // de verificação chega por email e o navegador do teste não tem caixa de entrada.
  // `pnpm --filter ... run` executa com cwd no pacote da API, então o `--env-file` do script
  // acha o .env de lá. Com `exec`, o node resolve o caminho contra o cwd de quem chamou e o
  // DATABASE_URL viria por acidente — daí o script declarado no package.json da API.
  execFileSync(
    "pnpm",
    ["--filter", "@consusimples/api", "run", "e2e:activate-tenant", email],
    { stdio: "inherit" },
  );
}
