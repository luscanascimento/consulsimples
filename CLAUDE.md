# consusimples

SaaS multi-tenant de gerenciamento de restaurante/lanchonete. Comanda, cozinha (KDS), caixa e
estoque. Sem delivery, sem app do cliente, sem emissão fiscal.

## Stack

Backend: NestJS 11 + Express 5. Frontend: Next.js 15 (App Router) + React 19. Banco: PostgreSQL 17
+ Prisma 6. Monorepo pnpm 11 + turbo 2, Node >= 22. Validação compartilhada em Zod 3.
Playbook: `docs/stack-playbook-next-nest.md` da engenharia-base.

## Hospedagem

Fora do Proxmox — VPS do cliente, `docker compose`. Proxy próprio na VPS (Caddy ou Traefik)
termina o TLS: **um** proxy na frente, `TRUST_PROXY_HOPS=1` (confirmar medindo `X-Forwarded-For`
real antes de fixar — procedimento em `docs/runbook-deploy.md`). Dokploy, CT 100 e
`dokploy-network` **não se aplicam**. Backup do PostgreSQL sai cifrado (GPG AES256) para storage
off-site via rclone — backup no mesmo disco não é backup. Só a **API** é containerizada e
implantada por este repo: não existe Dockerfile nem serviço compose para `apps/web`.

## Precedência

Ordem de carga não é ordem de autoridade. Modos injetados por hook (`ponytail`, `caveman`) são
nível 6 — preferência do agente. Perdem para este `CLAUDE.md` (nível 2) e para a constituição da
engenharia-base (nível 3). Nunca simplificar: validação de entrada, autorização, escopo de tenant,
observabilidade, teste de caminho crítico, acessibilidade.

## Roadmap de módulos

1. **Base** — auth multi-tenant, signup público, usuários/papéis, catálogo. **Implementado.**
2. **Comanda/pedido** — mesa e balcão, lançar item, modificadores, status.
3. **KDS cozinha** — fila de preparo, marcar pronto/entregue.
4. **Caixa** — fechar conta, dividir, formas de pagamento, fechamento de turno.
5. **Estoque** — insumo, ficha técnica, baixa por venda, CMV.

Cada módulo tem spec → plano → implementação próprios, em `docs/superpowers/`.

## Layout do repositório

```
apps/api/                     NestJS
  prisma/schema.prisma        7 models, 3 enums, @@unique([tenantId, id])
  prisma/migrations/          2 migrations (init, add_password_reset_token)
  scripts/activate-tenant.ts  atalho de e2e; lança erro se NODE_ENV=production
  src/main.ts                 helmet, CORS, json 1mb, trust proxy (número)
  src/app.module.ts           pino, throttler, 3 APP_GUARD, APP_FILTER
  src/config/env.ts           EnvSchema Zod; process.exit(1) no import
  src/common/                 scope.ts, defined.ts, decorators.ts, app-error,
                              all-exceptions.filter, zod-validation.pipe, correlation.middleware
  src/auth/                   controller, service, repository, token/password service,
                              jwt-auth.guard, roles.guard, tenant.throttler.guard
  src/users/ src/catalog/ src/tenant/ src/health/ src/prisma/ src/mail/
  src/**/*.spec.ts            unit puro (env, password.service, zod-validation.pipe)
                              + prisma.service.spec.ts (conecta no banco)
  test/                       9 *.e2e-spec.ts + token.service.spec.ts,
                              setup.ts, factories.ts, load-env.ts
  Dockerfile                  6 estágios, runtime non-root
  Dockerfile.dockerignore     (não é .dockerignore)
apps/web/                     Next.js
  src/app/(public)/           entrar, cadastrar, confirme-seu-email, verificar-email,
                              esqueci-senha, redefinir-senha
  src/app/(app)/              layout com requireSession(), page (redirect /cardapio),
                              cardapio/, usuarios/ (com loading.tsx), onboarding/,
                              nav.tsx, logout-action.ts
  src/components/             button, field, modal, empty-state, error-state, page-skeleton
  src/lib/                    session.ts, auth.ts, api.ts, errors.ts, money.ts
  src/env.ts  src/middleware.ts (só CSP)
  e2e/                        Playwright: global-setup.ts + auth, signup, password-reset,
                              catalog, users
packages/validation/          13 schemas Zod + types (auth, catalog, user); sem teste
docs/runbook-deploy.md        deploy, rollback, backup/restore, medir TRUST_PROXY_HOPS
docs/superpowers/{specs,plans}/
.github/workflows/ci.yml      job único, 6 gates
docker-compose.dev.yml        Postgres 17 em 5442:5432
docker-compose.prod.yml       migrate + api + postgres
scripts/backup-db.sh          pg_dump | gzip | gpg | rclone
```

## Comandos do dia a dia

| Comando | Uso |
|---|---|
| `pnpm install --frozen-lockfile` | instalar |
| `pnpm db:up` / `pnpm db:down` | Postgres de dev (porta **5442**) |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` | turbo em todo o workspace |
| `pnpm turbo lint typecheck test build` | o que o CI roda |
| `pnpm --filter @consusimples/api dev` | API em 3001 (carrega `.env` nativo do Node) |
| `pnpm --filter @consusimples/web dev` | Web em 3000 |
| `pnpm --filter @consusimples/api test` | jest (**exige Postgres de pé**) |
| `pnpm --filter @consusimples/api test -- tenant-isolation.e2e` | gate de isolamento |
| `pnpm --filter @consusimples/api exec prisma generate` | gerar o client (não há `postinstall`) |
| `pnpm --filter @consusimples/api exec prisma migrate deploy` | aplicar migrations |
| `pnpm --filter @consusimples/api exec prisma migrate status` | conferir pendências |
| `pnpm --filter @consusimples/api run e2e:activate-tenant <email>` | ativar tenant sem email |
| `pnpm --filter @consusimples/web e2e` | Playwright (sobe o Next sozinho; exige API em 3001) |
| `pnpm audit --audit-level=high` | gate de vulnerabilidade |
| `curl -s localhost:3001/health/live` \| `/health/ready` | versão / prontidão |

Não existe script `dev` na raiz. `prisma generate` não roda em `install` — só no `Dockerfile`
(estágios `prod-deps` e `build`); em clone novo é passo manual. Deploy/rollback/backup: seguir
`docs/runbook-deploy.md`.

## Arquitetura da API

**Camadas rígidas:** Controller (Zod pipe, `@Roles`, `@CurrentUser`, delegação) → Service (regra de
negócio, `AppError`) → Repository (só Prisma). Controller nunca toca `PrismaService` — as exceções
existentes são `TenantController` (débito conhecido, não replicar) e `HealthController`
(`SELECT 1` do readiness).

**Bootstrap (`main.ts`, ordem exata):** `NestFactory.create(AppModule, { bufferLogs: true })` →
`app.useLogger(app.get(Logger))` (nestjs-pino) → `helmet` (CSP `default-src 'none'`, HSTS só em
production) → `enableCors` (allowlist `CORS_ORIGINS`, `credentials: true`, sem PUT) →
`express.json({ limit: "1mb" })` → `set("trust proxy", env.TRUST_PROXY_HOPS)` → `listen(PORT)`.
**Não há** `setGlobalPrefix`, versionamento, `ValidationPipe` global, cookie-parser nem Swagger:
as rotas são `/auth/*`, `/users`, `/categories`, `/products`, `/tenant`, `/health/*` na raiz.

**Guards globais, nesta ordem:** `AppThrottlerGuard` → `JwtAuthGuard` → `RolesGuard`.
Autenticado é o padrão; opt-out é `@Public()`. Tracker padrão do throttler: `${ip}:${sub ?? body.email}`.

**Escopo de tenant:** não há RLS, nem Prisma extension, nem AsyncLocalStorage. É `type Scope =
{ tenantId: string }` (`src/common/scope.ts`) como **primeiro parâmetro de todo método de
repository de recurso** (users, catalog), com `tenantId` no `where`. Método que legitimamente
ignora tenant leva sufixo `Unscoped` no nome. `AuthRepository` é a exceção herdada — chaveia por
email/userId, recebe `tenantId: string` cru em `findByIdScoped` e usa `findUnique`/`update` por id
em `markLogin`, `updatePasswordHash` e nos consumidores de token; **não replicar em módulo de
recurso**. Redes de segurança reais: `@@unique([tenantId, id])`, FK composta
`products(tenant_id, category_id) → categories(tenant_id, id)` e os e2e adversariais.

**Regras de query:** `findFirst` (nunca `findUnique` por id), `updateMany`/`deleteMany` (nunca
`update`/`delete` por id) checando o `count` para decidir 404, `select` explícito via const
`SELECT` do módulo, `take` em toda listagem. `tenantId` vem **só** do JWT via `@CurrentUser`.

**Contrato de erro:** sempre `{ error: { code, message, details, correlationId } }`.
Códigos em uso: `AUTH_001` (sessão/credencial inválida), `AUTH_002`, `AUTH_003` (sessão revogada),
`AUTH_005`, `AUTH_006` (email não confirmado, 403), `AUTH_401`, `AUTH_403`, `USER_001`, `USER_002`
(precisa de um dono ativo, 409), `USER_404`, `CATALOG_001` (nome duplicado, 409), `CATALOG_404`,
`VALIDATION_001` (**422**, não 400). Qualquer `HttpException` que não seja `AppError` vira
`COMMON_${status}` — uuid malformado sai 400 `COMMON_400` (não `VALIDATION_001`) e readiness com
banco fora sai 503 `COMMON_503`. Recurso de outro tenant → **404, nunca 403**. Só status >= 500 é
logado.

### Matriz de rotas e papéis

| Rota | Papéis |
|---|---|
| `POST /auth/{signup,verify-email,login,refresh,forgot-password,reset-password}` | `@Public` |
| `GET /health/{live,ready}` | `@Public` |
| `GET /auth/me`, `POST /auth/logout` | qualquer autenticado |
| `GET /categories`, `GET /products`, `GET /products/:id` | **qualquer papel autenticado** (WAITER, KITCHEN, CASHIER incluídos) |
| `POST/PATCH/DELETE /categories`, `/products` | `OWNER`, `MANAGER` |
| `/users` (classe inteira) e `PATCH /tenant` | `OWNER`, `MANAGER` |

Leitura de catálogo aberta a todo papel é intencional — o Módulo 2 vai copiar esse padrão.
Todo `:id` passa por `ParseUUIDPipe`; `GET /products?categoryId=` usa
`new ParseUUIDPipe({ optional: true })` — sem isso o valor cru chega no WHERE e o Postgres
devolve 500 (`authz-adversarial.e2e-spec.ts` exige 400).

### Formatos de resposta que o web consome

`POST /auth/login` → `{ accessToken, refreshToken, user: { id, name, role, tenantId } }`.
`POST /auth/refresh` → `{ accessToken, refreshToken }` (refresh novo a cada chamada).
`GET /auth/me` → `{ id, name, role, tenantId }`.
signup / verify-email / forgot-password / reset-password → `{ ok: true }`.

## Modelo de dados

7 models, todos com `@id @default(uuid(7)) @db.Uuid`, timestamps `@db.Timestamptz(3)` e `@@map`
snake_case plural: `Tenant`, `User`, `Category`, `Product`, `RefreshToken`,
`EmailVerificationToken`, `PasswordResetToken`.

| Model | Pontos travados |
|---|---|
| `Tenant` | `slug @unique`, `status` nasce `PENDING_VERIFICATION`, `timezone` default `America/Sao_Paulo` |
| `User` | `email @unique` **global** (não por tenant), `role` sem default, `status` ACTIVE/DISABLED, `@@index([tenantId, role])` |
| `Category` | `@@unique([tenantId, name])` (P2002 → `CATALOG_001`), `active`, `sortOrder` |
| `Product` | `priceCents Int` — **nunca float, nunca Decimal**; FK composta com `Category` |
| `RefreshToken` | `familyId`, `tokenHash @unique` (sha256), `revokedAt`, `replacedBy` |
| `*Token` (verify/reset) | `tokenHash @unique`, `expiresAt`, `usedAt` (uso único via `updateMany usedAt: null`) |

Enums: `TenantStatus` (PENDING_VERIFICATION | ACTIVE | SUSPENDED), `UserStatus` (ACTIVE | DISABLED),
`UserRole` = **OWNER | MANAGER | WAITER | KITCHEN | CASHIER**. Sem ADMIN, sem RBAC granular,
**sem hierarquia**: `@Roles("MANAGER")` dá 403 para OWNER — listar todos os papéis explicitamente.
O privilégio OWNER > MANAGER existe só como regra em `UsersService` (só dono gerencia dono; não
rebaixar/desativar o último OWNER ativo → `USER_002`).

Delete é sempre soft e responde 204: produto → `available: false`, categoria → `active: false`,
usuário → `status: "DISABLED"` + revogação dos refresh tokens.

## Autenticação e sessão

| Item | Valor |
|---|---|
| Senha | argon2id `m=19456, t=2, p=1`, teto de 1024 bytes; `DUMMY_HASH` quando o email não existe |
| Access token | JWT `JWT_ACCESS_SECRET`, **15 min**, claims `{ sub, tenantId, role }` |
| Refresh token | **opaco**: `randomBytes(32).base64url`, guardado como sha256 hex, **30 dias** |
| Rotação | por uso, em `$transaction` com `updateMany({ revokedAt: null })` como lock otimista |
| Reuso detectado | revoga a **família inteira** — fora da transação, de propósito → `AUTH_003` |
| Logout | revoga **todos** os refresh tokens do usuário (todos os dispositivos), 204 |
| Verificação de email | token 32B, sha256, **24h**, link `${WEB_BASE_URL}/verificar-email?token=` |
| Reset de senha | token 32B, sha256, **1h**, `${WEB_BASE_URL}/redefinir-senha?token=`; consome os demais e revoga todas as sessões |
| Cookies | só no BFF Next: `__Host-at` (15 min) e `__Host-rt` (30 dias), httpOnly+secure+lax, path `/` |

Rotas: `POST /auth/signup` (**201**), `verify-email` (200), `login` (200), `refresh` (200),
`forgot-password` (**202**), `reset-password` (200) — todas `@Public`; `GET /auth/me` e
`POST /auth/logout` (204) autenticadas.

Signup e forgot-password são **enumeration-safe**: mesma resposta e mesmo corpo, email sempre em
background por `sendInBackground`. No signup o argon2 roda nos dois caminhos de propósito; em
forgot-password não há hash — o que iguala o tempo é o envio assíncrono (timing coberto por
`auth-session-audit.e2e-spec.ts`). Rate limit: signup 3/h **byIp**, login 5/15min, refresh
20/15min, forgot 3/h **byIp**, reset 10/h, default global 100/min. Rota nova que manda email para
endereço escolhido pelo cliente **precisa** de `getTracker: byIp`.

Invariantes menos óbvias:

- `consumeVerificationToken` ativa com `tenant.updateMany({ where: { id, status: "PENDING_VERIFICATION" } })`:
  o link de 24h **nunca ressuscita tenant `SUSPENDED`**, e o token é consumido mesmo assim.
- `GET /auth/me` resolve por `findByIdScoped`, cujo where inclui `status: "ACTIVE"`: usuário
  desativado com access token válido toma 401 ali (e o BFF o desloga), mas continua passando no
  `RolesGuard` nas demais rotas até o token expirar.
- Login também faz rehash automático quando `passwords.needsRehash(hash)` e grava `lastLoginAt`
  via `markLogin`.
- `AuthModule` é `@Global()` com `JwtModule.register({})` — o segredo vai por chamada em
  `signAsync`/`verifyAsync`; reimportar `JwtModule` em outro módulo é ruído.

## Arquitetura do web

- Gate de auth é `requireSession()` em `(app)/layout.tsx` (chama `GET /auth/me`, `redirect("/entrar")`).
  O `middleware.ts` **só** emite CSP com nonce: header na **requisição** (é assim que o Next carimba
  o nonce nos próprios `<script>`) e `Content-Security-Policy-Report-Only` na **resposta** — nada é
  bloqueado hoje; promover para enforce é trocar o nome do header da resposta. `matcher` exclui
  `_next/static`, `_next/image`, `favicon.ico`. Rota fora de `(app)/` é pública.
- `lib/session.ts` (`server-only`) é o único lugar que lê/escreve cookie. `clearSession()` sobrescreve
  com `maxAge: 0` — **não** trocar por `jar.delete()` (`__Host-` exige Secure).
- `lib/api.ts`: `apiFetch` (com sessão, Bearer, **uma única** tentativa de refresh no 401) e
  `apiPublic` (sem sessão). Todo fetch usa `cache: "no-store"`, sem exceção.
- Erro da API → pt-BR pelo mapa `MESSAGES` em `lib/errors.ts`; nunca ecoa o código cru.
- Um `actions.ts` por rota, `"use server"` na primeira linha, `FormState` local. Padrão:
  `schema.safeParse` → `fieldErrors` (primeiro erro por campo) → `apiFetch` → `revalidatePath` →
  `redirect()` **fora do `try`** (redirect funciona lançando). Exceção: `logout-action.ts`, Server
  Action de argumento único usada como `<form action={logoutAction}>` no `nav.tsx`.
- Formulário: `"use client"` + `useActionState(action, INITIAL)`, `<form ... noValidate>`,
  `<Field>` (aria-describedby/aria-invalid), `<Button>` com `useFormStatus` **dentro do form**.
  Erro geral em `role="alert"`, confirmação em `role="status"`. Modal = `<dialog>` nativo.
  `PageSkeleton` só aparece nos `loading.tsx` de `cardapio/` e `usuarios/`.
- Tailwind 4 sem config e sem tokens: paleta padrão (slate/sky/red/emerald), `globals.css` com 8
  linhas (`@import "tailwindcss"` e um `:focus-visible`), alvo de toque `min-h-11` manual. Estados
  obrigatórios por tela: carregando, vazio, erro, sem permissão, sucesso. Autorização na UI é
  ergonomia — a API barra de novo.
- Dinheiro em centavos; conversão só em `lib/money.ts` (`formatCents` normaliza NBSP).
- `next.config.ts` fixa `outputFileTracingRoot` na raiz do monorepo (senão o Next infere um
  diretório acima do repo), `transpilePackages: ["@consusimples/validation"]`, `reactStrictMode` e
  `poweredByHeader: false`. Pacote novo do workspace consumido pelo web entra em `transpilePackages`.

## Pacote `@consusimples/validation`

13 schemas + types, reexportados em `src/index.ts`: `signup/verifyEmail/login/refresh/
forgotPassword/resetPassword`, `create|updateCategory`, `create|updateProduct`, `userRole`,
`create|updateUser`. **Todo schema de objeto é `.strict()`** (campo extra → 422, inclusive
`tenantId` smugglado); `userRoleSchema` é um `z.enum` puro. Senha `min(12).max(1024)`;
`loginSchema` usa `min(1)` de propósito. Email `.email().max(254).toLowerCase().trim()`.
`priceCents: z.number().int().min(0).max(100_000_000)`. API consome com
`@Body(new ZodValidationPipe(schema))`; services importam só os types com `import type`. Web
consome com `safeParse` em Server Action. O pacote **não tem teste** (`"test": "echo no tests"`):
os schemas só são exercitados de lado, pelos e2e da API e pelas Server Actions.

## Testes

- API: jest + supertest contra **PostgreSQL real** (não há testcontainers, apesar do spec).
  `globalSetup: test/load-env.ts` (`process.loadEnvFile` de `.env.test` ou `.env`).
  `maxWorkers: 1` é **correção**, não otimização: as suítes dividem o banco e quase todas rodam
  `resetDb()` no `beforeEach` (`guards.e2e-spec.ts` é a única sem).
- Todo e2e sobe o `AppModule` inteiro e autentica com `app.get(TokenService).issueAccessToken(...)`.
  Só as suítes que disparam email trocam o mailer com `.overrideProvider(MAILER).useValue(fake)`
  (`signup`, `password-reset`, `authz-adversarial`, `auth-session-audit`); só as que passam pelo
  rate limit fazem `app.get(ThrottlerStorage).storage.clear()` no `beforeEach` (essas quatro mais
  `login`).
- Factories globais: `makeTenant`, `makeUser`, `makeCategory`, `makeProduct` (`test/factories.ts`).
  Helpers de cenário ficam locais ao `describe`.
- Teste de segurança assere **status HTTP e o estado no banco**. Suítes-chave:
  `tenant-isolation.e2e-spec.ts`, `authz-adversarial.e2e-spec.ts`, `auth-session-audit.e2e-spec.ts`,
  `guards.e2e-spec.ts` (ProbeController sintético, não toca dado — mas sobe o `AppModule`, então
  ainda exige Postgres de pé).
- Unit puro mora em `src/`, ao lado do código: `config/env.spec.ts`, `auth/password.service.spec.ts`,
  `common/zod-validation.pipe.spec.ts`. `src/prisma/prisma.service.spec.ts` e
  `test/token.service.spec.ts` conectam no Postgres real.
- Teto conhecido vira teste com nome `known ceiling: ...` — quebrar exige reescrever, não deletar.
  Hoje existe um só: access token que sobrevive a um reset de senha.
- Web: jest com `testEnvironment: "node"` e `testMatch: ["<rootDir>/src/**/*.spec.ts"]` — **só
  `.ts`, nunca `.tsx`**: não há teste de componente possível hoje, só `money.spec.ts` e
  `errors.spec.ts`. Playwright em `e2e/` com `webServer: { command: "pnpm dev",
  url: "http://localhost:3000/cadastrar", reuseExistingServer: true }` — o Playwright sobe o Next
  sozinho, só a API em 3001 precisa estar de pé à mão. A URL de prontidão é `/cadastrar` porque `/`
  só existe atrás da sessão. Login pela UI no `beforeEach` terminando em
  `await expect(page).toHaveURL(/\/cardapio/)`; seletores por papel/label; alerta sempre recortado
  em `main` e/ou `.first()`; `scrollWidth > clientWidth === false` como assertion.

## CI e gates

Job único `ci` (ubuntu-latest, sem matriz), serviço Postgres 17-alpine, na ordem:
`install --frozen-lockfile` → `pnpm turbo lint typecheck test build` → **tenant isolation gate**
(`test -- tenant-isolation.e2e`) → `prisma migrate status` → `prisma migrate diff ... --exit-code`
(drift de schema) → `pnpm audit --audit-level=high` → `gitleaks`. Sendo sequencial, falha de lint
impede os gates de segurança de rodarem.

Turbo: `build → ^build`; **`typecheck → ["^build", "build"]`** (o tsconfig do web inclui
`.next/types`, que o `next build` reescreve — mexer nisso reintroduz TS6053); `test → ^build`;
`lint` sem dependências. Só `build` declara `outputs`.

Política de dependência mora em `pnpm-workspace.yaml`, não no `package.json`: `allowBuilds` é
allowlist de quem pode rodar script de instalação (`@prisma/client`, `@prisma/engines`, `prisma`,
`argon2`, `esbuild`, `sharp`, `unrs-resolver`) e `overrides` força `postcss@>=8.5.18` e
`sharp@>=0.35.0` porque o `next` 15.5.x prende versões com aviso alto e `pnpm audit
--audit-level=high` é gate. Dependência nova com build script ou com advisory entra ali.

## Variáveis de ambiente

API (`apps/api/src/config/env.ts`; obrigatórias em **negrito**):

| Nome | Para quê |
|---|---|
| `NODE_ENV` | development \| test \| production (default development) |
| `PORT` | default 3001 |
| **`DATABASE_URL`** | precisa começar com `postgresql://` |
| **`JWT_ACCESS_SECRET`** | assina o access token (min 32) |
| **`JWT_REFRESH_SECRET`** | min 32 — exigido no boot e **não usado por nada** |
| **`CORS_ORIGINS`** | CSV de origens; comparação de string exata |
| `TRUST_PROXY_HOPS` | número 0..5, default 1 — alimenta `req.ip` e o rate limit |
| `APP_VERSION` | vem do `--build-arg GIT_SHA`; aparece em `/health/live` |
| `SERVICE_NAME`, `LOG_LEVEL` | base do logger pino |
| **`RESEND_API_KEY`**, **`MAIL_FROM`** | envio de email (Resend) |
| **`WEB_BASE_URL`** | base dos links de verificação e reset |

Web (`apps/web/src/env.ts`): `API_INTERNAL_URL` (server), `NEXT_PUBLIC_APP_ENV` (client, lido de
objeto literal chave-por-linha). Vêm de `apps/web/.env.local` (gitignored) — o web **não** enxerga
o `.env` da API, e sem esse arquivo `src/env.ts` lança no boot. Backup (`scripts/backup-db.sh`):
`POSTGRES_USER`, `POSTGRES_DB`, `BACKUP_PASSPHRASE`, `BACKUP_REMOTE`.

Variável nova entra no `EnvSchema`, no `.env.example` e no bloco `env:` do `ci.yml`. Exceção:
`SHADOW_DATABASE_URL` existe **só** no `ci.yml` e alimenta o `prisma migrate diff
--shadow-database-url` (gate de drift). **Nunca** ler `process.env` fora de `src/config/env.ts`
(API) / `src/env.ts` (web): na API isso é regra de lint (`no-restricted-properties`), com exceção
declarada só para `src/config/env.ts`, `src/main.ts` e `test/load-env.ts`; no web é convenção — o
ESLint não barra.

## Convenções de código

- Rotas e query params do web em **português kebab-case** (`/cardapio`, `?categoria=`,
  `?senha-redefinida=1`); exceção herdada: `/onboarding`. Papéis vêm em inglês da API e são
  traduzidos na borda por um mapa `ROLE_LABEL`.
- Arquivo em kebab-case exportando função nomeada em PascalCase. `export default` só em
  page/layout/loading. Import absoluto por `@/*`; relativo só no mesmo diretório.
- Comentário em **português** explicando o **porquê** de decisão não óbvia (segurança, ordem,
  armadilha de framework) — nunca o que o código faz. Manter esse estilo.
- `defined(dto)` antes de todo update parcial (por causa de `exactOptionalPropertyTypes`);
  prop opcional de componente declara `| undefined` explícito. As flags (`strict`,
  `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`) moram em
  `/tsconfig.base.json` e valem para os três pacotes de uma vez.
- Log estruturado com `event`, `tenantId`, `userId`/`actorId`; email passa por `maskEmail`.
- ESLint 9 flat config; `.eslintrc*` é ignorado. API e `packages/validation` usam
  `eslint.config.js` CommonJS; o web usa `eslint.config.mjs` (ESM) com `FlatCompat` sobre
  `next/core-web-vitals` e `next/typescript`. Todo lint com `--max-warnings 0`; o lint do web cobre
  `src` **e** `e2e`. `no-restricted-imports` proíbe import cruzado entre apps (`**/apps/*/src/**`)
  nos dois lados.
- Migration sempre `prisma migrate deploy` em serviço separado, nunca no entrypoint; migration
  destrutiva só por expand/contract em deploys separados (rollback não desfaz migration).
- Commits: conventional commits **em inglês**, imperativo, minúsculo, sem ponto, descrevendo o
  resultado com a razão embutida. Escopos: `api`, `web`, `deps`, `build`. Um commit = uma mudança
  que passa no CI sozinha. Trailer `Co-Authored-By: Claude Opus 5` nos recentes.

## Armadilhas

- **Isolamento é convenção.** Esquecer `tenantId` num `where` compila, passa no lint e vaza dados.
  Rodar o gate `tenant-isolation.e2e` antes de declarar pronto.
- **Sem `.env.test` no repo**: `pnpm --filter @consusimples/api test` cai no `.env` de dev e o
  `resetDb()` **apaga os dados de desenvolvimento**. Criar `.env.test` antes de rodar local.
- `migrateTestDb()` existe em `test/setup.ts` mas não é chamado por ninguém — banco novo exige
  `prisma migrate deploy` à mão. Por isso `migrate status` está **depois** do `test` no CI.
- `redact` do pino cobre `req.body.password`/`token` mas **não** `req.body.refreshToken`.
- `CorrelationMiddleware` descarta o `x-correlation-id` do cliente — correlacionar web↔api exige
  ler o header da **resposta**.
- `RolesGuard` confia no claim `role` do JWT e não consulta o banco: rebaixar/desativar tem até
  15 min de atraso. Teto conhecido, **sem teste** cobrindo essa defasagem específica.
- Throttler é **in-memory**: com N réplicas o limite vira 100×N. Escala horizontal exige Redis.
- `trust proxy` recebe **número**. `true` deixa qualquer cliente forjar `X-Forwarded-For` e burlar
  o rate limit de login.
- **Bug conhecido no web:** `requireSession()` roda no render do layout; o refresh automático tenta
  `cookies().set()` durante render, o Next 15 lança, o `catch` engole e o usuário é deslogado —
  na prática a sessão morre a cada 15 min. Corrigir exige mover o refresh para Server Action/Route
  Handler.
- `/onboarding` é código órfão: nada redireciona nem linka para ela. O middleware não tem gate.
- `ErrorState.onRetry` é prop morta (arquivo sem `"use client"`, chamadores são Server Components).
- `updateProductAction` não lê `categoryId`: mover produto de categoria é impossível pela UI hoje.
- `Field` não suporta `<select>`; o select de papel não mostra `fieldErrors?.role`.
- `ProductRepository.list` não filtra `available: true` — produto "apagado" continua na listagem.
  `CategoryRepository` filtra `active: true` em tudo: categoria desativada fica invisível **e**
  imutável, sem rota para reativar. `CategoryRepository.list` não tem `take`.
- Cookies `__Host-` exigem Secure: dev apontado para host LAN por HTTP "loga" sem gravar cookie.
- Não existe `error.tsx` nem `not-found.tsx` em `src/app/`.
- `apps/api/Dockerfile.dockerignore` (não `.dockerignore`); padrões precisam do prefixo `**/`.
- `prisma` está em `dependencies` de propósito (o serviço `migrate` precisa dele após install
  `--prod`). `pnpm prune --prod` não funciona no pnpm 11 — daí o estágio `prod-deps`.
- `prisma generate` roda dentro do alpine (musl); client gerado em macOS não executa.
- `NODE_OPTIONS=--max-old-space-size=384` e `limits: memory: 512M` são um par acoplado.
- `GIT_SHA` precisa estar exportado no shell **e** gravado no `.env` da VPS.
- Backup **não tem retenção**: `rclone copy` nunca apaga. Buraco aberto — fechar no provedor.
- Playwright não roda no CI e depende de `http://localhost:3001` hardcoded no global-setup;
  `E2E_EMAIL` é fixo de propósito e a conta de e2e não é limpa entre execuções.
- `.gitignore` cobre `.env` e `.env.local`, mas **não** `.env.test` nem `.env.backup`.
- `turbo.json` não declara `globalEnv`/`env`: mudar `DATABASE_URL` não invalida o cache local.
- `updateTenantSchema` mora inline em `tenant.controller.ts`, fora de `packages/validation`.
- O nome `auth/tenant.throttler.guard.ts` engana: o tracker não usa `tenantId` nenhum.
- O spec do Módulo 1 cita testcontainers, Prisma extension e AsyncLocalStorage — **nada disso
  existe**. Ler o spec como histórico; o código é a fonte de verdade.
