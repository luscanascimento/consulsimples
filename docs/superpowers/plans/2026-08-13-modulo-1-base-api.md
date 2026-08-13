# Módulo 1 — Base (API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a API do módulo 1 do consusimples — signup público de restaurante, verificação de email, login com rotação de refresh token, papéis, catálogo (categorias e produtos) — com isolamento de tenant provado por teste.

**Architecture:** Monorepo pnpm com `apps/api` (NestJS) e `packages/validation` (zod). Isolamento multi-tenant por `tenantId` em toda tabela, injetado em um `Scope` que todo método de repository é obrigado a receber pelo tipo. Autenticação global por guard (nega por padrão, `@Public()` é a exceção); autorização em duas camadas independentes: papel na rota e `tenantId` no `WHERE`.

**Tech Stack:** Node 22, pnpm 10, Turborepo, NestJS 11, Prisma 6, PostgreSQL 17, zod, argon2, `@nestjs/jwt`, `@nestjs/throttler`, `nestjs-pino`, Jest + supertest, Resend.

## Global Constraints

- **Idioma:** código, nomes de API, commits, flags e mensagens de erro em inglês. Comentários e documentação em pt-BR.
- **Commits:** conventional commits, `type(scope): descrição no imperativo`. Um commit = uma mudança que passa no CI sozinha.
- **Dinheiro:** centavos inteiros (`Int`). Nunca float, nunca `Decimal` neste projeto.
- **IDs públicos:** UUIDv7 via `@default(uuid(7))` do Prisma.
- **Datas:** `@db.Timestamptz(3)` sempre. Nunca `timestamp` sem timezone.
- **Nomes no banco:** model `PascalCase` singular no Prisma, tabela `snake_case` plural via `@@map`/`@map`.
- **Validação:** zod em `packages/validation`, fonte única. Erro de validação é sempre `VALIDATION_001` / HTTP 422 no repositório inteiro.
- **`process.env` cru:** proibido fora de `src/config/env.ts` e `main.ts` (antes do import de `env`). Travado por ESLint.
- **Prisma:** `findUnique({ where: { id } })` proibido em entidade com dono. Sempre `findFirst` com `tenantId`, sempre `updateMany`/`deleteMany` com `tenantId`. Método sem escopo chama-se `*Unscoped` e leva comentário justificando.
- **`$queryRaw` / `$executeRaw`:** proibidos fora de `src/**/raw/*.ts`.
- **Recurso de outro tenant:** responde **404**, nunca 403.
- **Log:** nunca senha, token, hash ou cookie. Email mascarado.
- **`TRUST_PROXY_HOPS`:** default `1` neste projeto (VPS do cliente, um proxy). Valor confirmado por medição antes do primeiro deploy real.
- **Testes:** integração roda contra PostgreSQL real, nunca contra mock de `PrismaClient`.

---

## File Structure

```
package.json                      workspaces + scripts raiz
pnpm-workspace.yaml               packages: apps/*, packages/*
turbo.json                        pipeline build/lint/typecheck/test
tsconfig.base.json                strict + noUncheckedIndexedAccess
docker-compose.dev.yml            PostgreSQL 17 local
docker-compose.prod.yml           VPS do cliente: migrate job + api + postgres
scripts/backup-db.sh              pg_dump cifrado para storage off-site
docs/runbook-deploy.md            primeiro deploy, rollback, trust proxy
.github/workflows/ci.yml          gates: lint, typecheck, test, migrate status/diff, audit, gitleaks
.env.example                      todas as chaves com CHANGE_ME

packages/validation/src/
  index.ts                        reexporta os schemas
  auth.ts                         signup, login, verify-email, refresh
  catalog.ts                      category e product
  user.ts                         create/update user

apps/api/src/
  main.ts                         bootstrap: env, helmet, cors, trust proxy, pipes, filtro
  app.module.ts                   composição dos módulos + guards globais
  config/env.ts                   EnvSchema zod, process.exit(1) no boot
  common/
    app-error.ts                  AppError com code/status
    all-exceptions.filter.ts      envelope único + mapeamento Prisma
    zod-validation.pipe.ts        ZodValidationPipe (schema no construtor)
    decorators.ts                 @Public, @Roles, @CurrentUser
    correlation.middleware.ts     x-correlation-id por request
    scope.ts                      type Scope = { tenantId: string }
  prisma/
    prisma.module.ts
    prisma.service.ts             singleton, $disconnect no destroy
  health/
    health.controller.ts          /health/live e /health/ready
  mail/
    mail.module.ts
    mailer.port.ts                MAILER token + interface
    resend.mailer.ts              implementação real
  auth/
    auth.module.ts
    auth.controller.ts            signup, verify-email, login, refresh, logout
    auth.service.ts               orquestra signup/login/refresh
    password.service.ts           argon2id: hash, verify, needsRehash
    token.service.ts              access JWT + refresh opaco com família
    auth.repository.ts            queries de user/tenant/refreshToken
    jwt-auth.guard.ts             global, nega por padrão
    roles.guard.ts                global, lê @Roles
    tenant.throttler.guard.ts     tracker ip:subject
  users/
    users.module.ts  users.controller.ts  users.service.ts  users.repository.ts
  catalog/
    catalog.module.ts  category.controller.ts  category.service.ts  category.repository.ts
    product.controller.ts  product.service.ts  product.repository.ts

apps/api/test/
  setup.ts                        migrate deploy + truncate entre testes
  factories.ts                    makeTenant, makeUser, makeCategory, makeProduct
  guards.e2e-spec.ts  signup.e2e-spec.ts  login.e2e-spec.ts  password-reset.e2e-spec.ts
  catalog.e2e-spec.ts  users.e2e-spec.ts  tenant-isolation.e2e-spec.ts
```

**Por que assim:** cada módulo de domínio guarda controller + service + repository juntos — arquivos que mudam juntos moram juntos. O repository é a única camada que toca Prisma, e a única que conhece `tenantId`.

---

### Task 1: Fundação do monorepo

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `docker-compose.dev.yml`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nada (primeira task)
- Produces: scripts `pnpm turbo lint typecheck test build`; PostgreSQL local em `localhost:5432`, database `consusimples`, user `consusimples`, senha `dev`

- [ ] **Step 1: Criar os arquivos de raiz do workspace**

`package.json`:
```json
{
  "name": "consusimples",
  "private": true,
  "packageManager": "pnpm@10.0.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "db:up": "docker compose -f docker-compose.dev.yml up -d",
    "db:down": "docker compose -f docker-compose.dev.yml down"
  },
  "devDependencies": { "turbo": "^2.3.0", "typescript": "^5.7.0" }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
onlyBuiltDependencies:
  - "@prisma/engines"
  - "prisma"
  - argon2
  - esbuild
```

`turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] },
    "lint": {},
    "dev": { "cache": false, "persistent": true }
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

`.gitignore`:
```
node_modules/
dist/
.next/
.turbo/
.env
.env.local
coverage/
*.log
```

- [ ] **Step 2: Criar o PostgreSQL local e o `.env.example`**

`docker-compose.dev.yml`:
```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: consusimples
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: consusimples
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U consusimples"]
      interval: 5s
      timeout: 5s
      retries: 10
volumes:
  pgdata:
```

`.env.example` — todas as chaves, placeholder óbvio, nenhum valor real:
```bash
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://consusimples:dev@localhost:5432/consusimples
JWT_ACCESS_SECRET=CHANGE_ME_at_least_32_characters_long_secret
JWT_REFRESH_SECRET=CHANGE_ME_another_32_characters_long_secret
CORS_ORIGINS=http://localhost:3000
TRUST_PROXY_HOPS=1
APP_VERSION=dev
SERVICE_NAME=api
LOG_LEVEL=info
RESEND_API_KEY=CHANGE_ME
MAIL_FROM=nao-responda@consusimples.local
WEB_BASE_URL=http://localhost:3000
```

- [ ] **Step 3: Subir o banco e verificar**

Run: `pnpm db:up && docker compose -f docker-compose.dev.yml ps`
Expected: serviço `postgres` com estado `healthy`.

- [ ] **Step 4: Criar o workflow de CI**

`.github/workflows/ci.yml`:
```yaml
name: ci
on: [push, pull_request]
jobs:
  ci:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: consusimples
          POSTGRES_PASSWORD: ci
          POSTGRES_DB: consusimples_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U consusimples" --health-interval 5s
          --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgresql://consusimples:ci@localhost:5432/consusimples_test
      SHADOW_DATABASE_URL: postgresql://consusimples:ci@localhost:5432/consusimples_shadow
      JWT_ACCESS_SECRET: ci_access_secret_at_least_32_characters
      JWT_REFRESH_SECRET: ci_refresh_secret_at_least_32_characters
      CORS_ORIGINS: http://localhost:3000
      RESEND_API_KEY: ci_fake_key
      MAIL_FROM: ci@consusimples.local
      WEB_BASE_URL: http://localhost:3000
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo lint typecheck test build
      - run: pnpm --filter @consusimples/api exec prisma migrate status
      - run: |
          pnpm --filter @consusimples/api exec prisma migrate diff \
            --from-migrations ./prisma/migrations \
            --to-schema-datamodel ./prisma/schema.prisma \
            --shadow-database-url "$SHADOW_DATABASE_URL" \
            --exit-code
      - run: pnpm audit --audit-level=high
      - uses: gitleaks/gitleaks-action@v2
```

Os passos de Prisma só passam a partir da Task 3; até lá o CI falha neles, o que é esperado e intencional — o gate existe antes do código que ele protege.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json tsconfig.base.json .gitignore .env.example docker-compose.dev.yml .github/workflows/ci.yml
git commit -m "chore: bootstrap pnpm monorepo, local postgres and CI gates"
```

---

### Task 2: Bootstrap seguro da API

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/.eslintrc.json`, `apps/api/jest.config.js`, `apps/api/src/config/env.ts`, `apps/api/src/common/app-error.ts`, `apps/api/src/common/all-exceptions.filter.ts`, `apps/api/src/common/zod-validation.pipe.ts`, `apps/api/src/common/correlation.middleware.ts`, `apps/api/src/health/health.controller.ts`, `apps/api/src/app.module.ts`, `apps/api/src/main.ts`
- Test: `apps/api/src/config/env.spec.ts`, `apps/api/src/common/zod-validation.pipe.spec.ts`

**Interfaces:**
- Consumes: scripts do workspace (Task 1)
- Produces:
  - `env: Env` de `src/config/env.ts`
  - `class AppError extends Error { constructor(code: string, message: string, status: number, details?: unknown) }`
  - `class ZodValidationPipe implements PipeTransform { constructor(schema: ZodSchema) }`
  - `GET /health/live` → `{ status: "ok", version: string }`

- [ ] **Step 1: Criar o package da API**

`apps/api/package.json`:
```json
{
  "name": "@consusimples/api",
  "private": true,
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "lint": "eslint src test --max-warnings 0",
    "typecheck": "tsc --noEmit",
    "test": "jest"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@consusimples/validation": "workspace:*",
    "helmet": "^8.0.0",
    "nestjs-pino": "^4.1.0",
    "pino-http": "^10.3.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@types/express": "^5.0.0",
    "@types/jest": "^29.5.14",
    "@types/node": "^22.10.0",
    "@types/supertest": "^6.0.2",
    "eslint": "^9.17.0",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "typescript": "^5.7.0"
  }
}
```

`apps/api/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src/**/*", "test/**/*"]
}
```

`apps/api/jest.config.js`:
```js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  testMatch: ["**/*.spec.ts", "**/*.e2e-spec.ts"],
};
```

`apps/api/.eslintrc.json` — trava o acesso cru a `process.env` e o import cruzado entre apps:
```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  "rules": {
    "no-restricted-properties": [
      "error",
      { "object": "process", "property": "env", "message": "Use env de src/config/env.ts" }
    ],
    "no-restricted-imports": [
      "error",
      { "patterns": ["**/apps/*/src/**"] }
    ]
  },
  "overrides": [
    { "files": ["src/config/env.ts", "src/main.ts"], "rules": { "no-restricted-properties": "off" } }
  ]
}
```

- [ ] **Step 2: Escrever o teste do schema de env (falha primeiro)**

`apps/api/src/config/env.spec.ts`:
```ts
import { EnvSchema } from "./env";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  CORS_ORIGINS: "http://localhost:3000",
  RESEND_API_KEY: "k",
  MAIL_FROM: "no-reply@consusimples.local",
  WEB_BASE_URL: "http://localhost:3000",
};

describe("EnvSchema", () => {
  it("applies defaults for optional values", () => {
    const env = EnvSchema.parse(valid);
    expect(env.PORT).toBe(3001);
    expect(env.TRUST_PROXY_HOPS).toBe(1);
    expect(env.NODE_ENV).toBe("development");
  });

  it("rejects a secret shorter than 32 characters", () => {
    const r = EnvSchema.safeParse({ ...valid, JWT_ACCESS_SECRET: "short" });
    expect(r.success).toBe(false);
  });

  it("splits CORS_ORIGINS into a list of urls", () => {
    const env = EnvSchema.parse({ ...valid, CORS_ORIGINS: "http://a.com, http://b.com" });
    expect(env.CORS_ORIGINS).toEqual(["http://a.com", "http://b.com"]);
  });

  it("rejects a DATABASE_URL that is not postgresql", () => {
    const r = EnvSchema.safeParse({ ...valid, DATABASE_URL: "mysql://u:p@h:3306/d" });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `pnpm --filter @consusimples/api test -- env.spec`
Expected: FAIL — `Cannot find module './env'`.

- [ ] **Step 4: Implementar o schema de env**

`apps/api/src/config/env.ts`:
```ts
import { z } from "zod";

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  // .min(32) pega truncamento silencioso do painel de deploy
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  CORS_ORIGINS: z
    .string()
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.string().url()).min(1)),
  // VPS do cliente: um proxy (Caddy/Traefik) na frente. Confirmar por medição antes do deploy.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  APP_VERSION: z.string().default("dev"),
  SERVICE_NAME: z.string().default("api"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  RESEND_API_KEY: z.string().min(1),
  MAIL_FROM: z.string().min(1),
  WEB_BASE_URL: z.string().url(),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // Só o NOME e o motivo. Nunca o valor — vaza segredo no log de boot.
  for (const i of parsed.error.issues) console.error(`[env] ${i.path.join(".")}: ${i.message}`);
  process.exit(1);
}
export const env: Env = parsed.data;
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `pnpm --filter @consusimples/api test -- env.spec`
Expected: PASS, 4 testes.

- [ ] **Step 6: Escrever o teste do pipe de validação (falha primeiro)**

`apps/api/src/common/zod-validation.pipe.spec.ts`:
```ts
import { z } from "zod";
import { AppError } from "./app-error";
import { ZodValidationPipe } from "./zod-validation.pipe";

const schema = z.object({ name: z.string().min(1) }).strict();

describe("ZodValidationPipe", () => {
  it("returns parsed data when valid", () => {
    const pipe = new ZodValidationPipe(schema);
    expect(pipe.transform({ name: "Bar do Zé" })).toEqual({ name: "Bar do Zé" });
  });

  it("throws VALIDATION_001 with status 422 when invalid", () => {
    const pipe = new ZodValidationPipe(schema);
    try {
      pipe.transform({ name: "" });
      fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("VALIDATION_001");
      expect((e as AppError).status).toBe(422);
    }
  });

  it("rejects unknown keys because the schema is strict", () => {
    const pipe = new ZodValidationPipe(schema);
    expect(() => pipe.transform({ name: "ok", role: "OWNER" })).toThrow(AppError);
  });
});
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `pnpm --filter @consusimples/api test -- zod-validation`
Expected: FAIL — `Cannot find module './app-error'`.

- [ ] **Step 8: Implementar `AppError` e o pipe**

`apps/api/src/common/app-error.ts`:
```ts
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}
```

`apps/api/src/common/zod-validation.pipe.ts`:
```ts
import { Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";
import { AppError } from "./app-error";

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const r = this.schema.safeParse(value);
    // Um código e um status para falha de validação em TODO o repositório.
    if (!r.success) {
      throw new AppError("VALIDATION_001", "Payload inválido", 422, { issues: r.error.issues });
    }
    return r.data;
  }
}
```

- [ ] **Step 9: Rodar e ver passar**

Run: `pnpm --filter @consusimples/api test -- zod-validation`
Expected: PASS, 3 testes.

- [ ] **Step 10: Implementar o filtro de exceções, o correlation ID e o health check**

`apps/api/src/common/all-exceptions.filter.ts`:
```ts
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AppError } from "./app-error";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const correlationId = String(req.headers["x-correlation-id"] ?? "");

    let status = 500;
    let code = "COMMON_500";
    let message = "Erro interno";
    let details: unknown;

    if (exception instanceof AppError) {
      status = exception.status;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = status === 401 ? "AUTH_401" : status === 403 ? "AUTH_403" : `COMMON_${status}`;
      message = exception.message;
    }

    if (status >= 500) {
      this.logger.error({ err: exception, correlationId }, "unhandled exception");
    }

    res.status(status).json({ error: { code, message, details, correlationId } });
  }
}
```

`apps/api/src/common/correlation.middleware.ts`:
```ts
import { Injectable, type NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // `set`, nunca `append`: sobrescreve o valor que o cliente possa ter mandado.
    const id = randomUUID();
    req.headers["x-correlation-id"] = id;
    res.setHeader("x-correlation-id", id);
    next();
  }
}
```

`apps/api/src/health/health.controller.ts`:
```ts
import { Controller, Get } from "@nestjs/common";
import { env } from "@/config/env";
import { Public } from "@/common/decorators";

@Controller("health")
export class HealthController {
  @Public()
  @Get("live")
  live() {
    return { status: "ok", version: env.APP_VERSION };
  }
}
```

`apps/api/src/common/decorators.ts` — o `@Public()` já nasce aqui porque o health precisa dele; `@Roles` e `@CurrentUser` entram na Task 6:
```ts
import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC, true);
```

- [ ] **Step 11: Compor o módulo e o bootstrap**

`apps/api/src/app.module.ts`:
```ts
import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import { env } from "@/config/env";
import { AllExceptionsFilter } from "@/common/all-exceptions.filter";
import { CorrelationMiddleware } from "@/common/correlation.middleware";
import { HealthController } from "@/health/health.controller";

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.LOG_LEVEL,
        base: { service: env.SERVICE_NAME, version: env.APP_VERSION },
        customProps: (req) => ({ correlationId: req.headers["x-correlation-id"] }),
        // Nunca logar credencial nem cookie.
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "req.body.password",
            "req.body.token",
          ],
          remove: true,
        },
      },
    }),
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware).forRoutes("*");
  }
}
```

`apps/api/src/main.ts`:
```ts
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.use(
    helmet({
      // API JSON não renderiza HTML: CSP mínima. A CSP de verdade mora no Next.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          "default-src": ["'none'"],
          "frame-ancestors": ["'none'"],
          "base-uri": ["'none'"],
          "form-action": ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: "same-site" },
      referrerPolicy: { policy: "no-referrer" },
      hsts: env.NODE_ENV === "production" ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );

  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // same-origin, curl, health: não é CORS
      cb(null, env.CORS_ORIGINS.includes(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Correlation-Id"],
    maxAge: 86_400,
  });

  app.use(express.json({ limit: "1mb" })); // body ilimitado é DoS grátis
  // Número, nunca `true`: `true` aceita a entrada do XFF que o cliente controla.
  app.getHttpAdapter().getInstance().set("trust proxy", env.TRUST_PROXY_HOPS);

  await app.listen(env.PORT);
}
void bootstrap();
```

- [ ] **Step 12: Instalar, subir e verificar o health**

Run:
```bash
pnpm install
cp .env.example apps/api/.env
pnpm --filter @consusimples/api dev
```
Em outro terminal: `curl -i localhost:3001/health/live`
Expected: `HTTP/1.1 200`, corpo `{"status":"ok","version":"dev"}`, header `x-correlation-id` presente.

- [ ] **Step 13: Commit**

```bash
git add apps/api packages
git commit -m "feat(api): bootstrap nest app with validated env, helmet, cors and structured logs"
```

---

### Task 3: Schema Prisma e readiness

**Files:**
- Create: `apps/api/prisma/schema.prisma`, `apps/api/src/prisma/prisma.service.ts`, `apps/api/src/prisma/prisma.module.ts`
- Modify: `apps/api/src/health/health.controller.ts`, `apps/api/src/app.module.ts`, `apps/api/package.json`
- Test: `apps/api/test/setup.ts`, `apps/api/test/factories.ts`, `apps/api/src/prisma/prisma.service.spec.ts`

**Interfaces:**
- Consumes: `env.DATABASE_URL` (Task 2)
- Produces:
  - `PrismaService extends PrismaClient`, exportado por `PrismaModule` (global)
  - Models `Tenant`, `User`, `Category`, `Product`, `RefreshToken`, `EmailVerificationToken`
  - Enums `TenantStatus { PENDING_VERIFICATION ACTIVE SUSPENDED }`, `UserRole { OWNER MANAGER WAITER KITCHEN CASHIER }`, `UserStatus { ACTIVE DISABLED }`
  - `GET /health/ready` → `{ status: "ok" }` ou 503
  - `resetDb()` e as factories `makeTenant`, `makeUser`, `makeCategory`, `makeProduct` para os testes

- [ ] **Step 1: Escrever o schema**

`apps/api/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum TenantStatus {
  PENDING_VERIFICATION
  ACTIVE
  SUSPENDED

  @@map("tenant_status")
}

enum UserRole {
  OWNER
  MANAGER
  WAITER
  KITCHEN
  CASHIER

  @@map("user_role")
}

enum UserStatus {
  ACTIVE
  DISABLED

  @@map("user_status")
}

model Tenant {
  id        String       @id @default(uuid(7)) @db.Uuid
  name      String
  slug      String       @unique
  status    TenantStatus @default(PENDING_VERIFICATION)
  timezone  String       @default("America/Sao_Paulo")
  createdAt DateTime     @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime     @updatedAt @map("updated_at") @db.Timestamptz(3)

  users      User[]
  categories Category[]
  products   Product[]

  @@map("tenants")
}

model User {
  id           String     @id @default(uuid(7)) @db.Uuid
  tenantId     String     @map("tenant_id") @db.Uuid
  email        String     @unique
  passwordHash String     @map("password_hash")
  name         String
  role         UserRole
  status       UserStatus @default(ACTIVE)
  lastLoginAt  DateTime?  @map("last_login_at") @db.Timestamptz(3)
  createdAt    DateTime   @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt    DateTime   @updatedAt @map("updated_at") @db.Timestamptz(3)

  tenant             Tenant                    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  refreshTokens      RefreshToken[]
  verificationTokens EmailVerificationToken[]

  // tenantId primeiro: toda query filtra por tenant antes de qualquer outra coluna.
  @@unique([tenantId, id])
  @@index([tenantId, role])
  @@map("users")
}

model Category {
  id        String   @id @default(uuid(7)) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  name      String
  sortOrder Int      @default(0) @map("sort_order")
  active    Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  tenant   Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  products Product[]

  @@unique([tenantId, id])
  @@unique([tenantId, name])
  @@index([tenantId, sortOrder])
  @@map("categories")
}

model Product {
  id          String   @id @default(uuid(7)) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  categoryId  String   @map("category_id") @db.Uuid
  name        String
  description String?
  // Dinheiro em centavos inteiros. Nunca float, nunca Decimal neste projeto.
  priceCents  Int      @map("price_cents")
  available   Boolean  @default(true)
  sortOrder   Int      @default(0) @map("sort_order")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  // FK composta com tenantId: o banco impede um produto apontar para categoria de outro tenant.
  category Category @relation(fields: [tenantId, categoryId], references: [tenantId, id], onDelete: Cascade)

  @@unique([tenantId, id])
  @@index([tenantId, categoryId, sortOrder])
  @@map("products")
}

model RefreshToken {
  id         String    @id @default(uuid(7)) @db.Uuid
  userId     String    @map("user_id") @db.Uuid
  familyId   String    @map("family_id") @db.Uuid
  tokenHash  String    @unique @map("token_hash")
  expiresAt  DateTime  @map("expires_at") @db.Timestamptz(3)
  revokedAt  DateTime? @map("revoked_at") @db.Timestamptz(3)
  replacedBy String?   @map("replaced_by") @db.Uuid
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([familyId])
  @@map("refresh_tokens")
}

model EmailVerificationToken {
  id        String    @id @default(uuid(7)) @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  tokenHash String    @unique @map("token_hash")
  expiresAt DateTime  @map("expires_at") @db.Timestamptz(3)
  usedAt    DateTime? @map("used_at") @db.Timestamptz(3)
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("email_verification_tokens")
}
```

- [ ] **Step 2: Gerar a migration e revisar o SQL**

Adicionar a `apps/api/package.json` em `dependencies`: `"@prisma/client": "^6.2.0"`; em `devDependencies`: `"prisma": "^6.2.0"`.

Run:
```bash
pnpm install
pnpm --filter @consusimples/api exec prisma migrate dev --name init
```
Expected: cria `apps/api/prisma/migrations/<timestamp>_init/migration.sql`.

Abrir o SQL gerado e conferir: nenhum `DROP`, todas as colunas de data são `timestamptz(3)`, `price_cents` é `integer`, e a FK de `products` referencia `(tenant_id, id)` de `categories`.

- [ ] **Step 3: Escrever o teste de conexão (falha primeiro)**

`apps/api/src/prisma/prisma.service.spec.ts`:
```ts
import { PrismaService } from "./prisma.service";

describe("PrismaService", () => {
  const prisma = new PrismaService();
  afterAll(async () => prisma.$disconnect());

  it("connects to postgres", async () => {
    await prisma.$connect();
    const rows = await prisma.tenant.findMany({ take: 1 });
    expect(Array.isArray(rows)).toBe(true);
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm --filter @consusimples/api test -- prisma.service`
Expected: FAIL — `Cannot find module './prisma.service'`.

- [ ] **Step 5: Implementar o `PrismaService` e o módulo**

`apps/api/src/prisma/prisma.service.ts`:
```ts
import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

`apps/api/src/prisma/prisma.module.ts`:
```ts
import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @consusimples/api test -- prisma.service`
Expected: PASS.

- [ ] **Step 7: Adicionar `/health/ready` e registrar o módulo**

Substituir `apps/api/src/health/health.controller.ts` por:
```ts
import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { env } from "@/config/env";
import { Public } from "@/common/decorators";
import { PrismaService } from "@/prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get("live")
  live() {
    return { status: "ok", version: env.APP_VERSION };
  }

  @Public()
  @Get("ready")
  async ready() {
    try {
      // Readiness confere a dependência que impede servir tráfego: o banco.
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok" };
    } catch {
      throw new ServiceUnavailableException("database unavailable");
    }
  }
}
```

O `$queryRaw` acima é a exceção sancionada da regra: é literal, sem interpolação de entrada do usuário, e vive no health check. Adicionar a linha ao override do ESLint quando a regra de raw for criada.

Em `apps/api/src/app.module.ts`, adicionar `PrismaModule` ao array `imports`:
```ts
import { PrismaModule } from "@/prisma/prisma.module";
// imports: [LoggerModule.forRoot({ ... }), PrismaModule],
```

- [ ] **Step 8: Criar o harness de teste**

`apps/api/test/setup.ts`:
```ts
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export function migrateTestDb() {
  // migrate deploy: só aplica o que está versionado. `migrate dev` jamais em CI.
  execSync("pnpm exec prisma migrate deploy", { stdio: "inherit" });
}

export async function resetDb() {
  // Ordem: filhos antes dos pais. Cascade tornaria isso desnecessário, mas explícito é auditável.
  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.user.deleteMany(),
    prisma.tenant.deleteMany(),
  ]);
}
```

`apps/api/test/factories.ts`:
```ts
import { randomUUID } from "node:crypto";
import { prisma } from "./setup";

export const makeTenant = (over: Partial<{ name: string; slug: string; status: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" }> = {}) =>
  prisma.tenant.create({
    data: {
      name: over.name ?? "Bar do Teste",
      slug: over.slug ?? `bar-${randomUUID().slice(0, 8)}`,
      status: over.status ?? "ACTIVE",
    },
  });

export const makeUser = (
  tenantId: string,
  over: Partial<{ email: string; name: string; role: "OWNER" | "MANAGER" | "WAITER" | "KITCHEN" | "CASHIER"; passwordHash: string }> = {},
) =>
  prisma.user.create({
    data: {
      tenantId,
      email: over.email ?? `u-${randomUUID()}@test.dev`,
      name: over.name ?? "Teste",
      role: over.role ?? "OWNER",
      passwordHash: over.passwordHash ?? "not-a-real-hash",
    },
  });

export const makeCategory = (tenantId: string, over: Partial<{ name: string; sortOrder: number }> = {}) =>
  prisma.category.create({
    data: {
      tenantId,
      name: over.name ?? `Categoria ${randomUUID().slice(0, 6)}`,
      sortOrder: over.sortOrder ?? 0,
    },
  });

export const makeProduct = (
  tenantId: string,
  categoryId: string,
  over: Partial<{ name: string; priceCents: number; available: boolean }> = {},
) =>
  prisma.product.create({
    data: {
      tenantId,
      categoryId,
      name: over.name ?? `Produto ${randomUUID().slice(0, 6)}`,
      priceCents: over.priceCents ?? 1990,
      available: over.available ?? true,
    },
  });
```

- [ ] **Step 9: Verificar o readiness contra o banco**

Run: `pnpm --filter @consusimples/api dev` e em outro terminal `curl -i localhost:3001/health/ready`
Expected: `HTTP/1.1 200`, `{"status":"ok"}`.

Depois: `pnpm db:down && curl -i localhost:3001/health/ready`
Expected: `HTTP/1.1 503`. Subir o banco de novo com `pnpm db:up`.

- [ ] **Step 10: Commit**

```bash
git add apps/api/prisma apps/api/src apps/api/test apps/api/package.json
git commit -m "feat(api): add prisma schema, tenant-scoped indexes and readiness probe"
```

---

### Task 4: Hash de senha com argon2id

**Files:**
- Create: `apps/api/src/auth/password.service.ts`
- Test: `apps/api/src/auth/password.service.spec.ts`

**Interfaces:**
- Consumes: nada além do Nest
- Produces: `PasswordService` com
  - `hash(plain: string): Promise<string>`
  - `verify(hash: string, plain: string): Promise<boolean>`
  - `needsRehash(hash: string): boolean`
  - `readonly DUMMY_HASH: string` — hash fixo para gastar tempo comparável em login de email inexistente

- [ ] **Step 1: Escrever o teste (falha primeiro)**

`apps/api/src/auth/password.service.spec.ts`:
```ts
import { AppError } from "@/common/app-error";
import { PasswordService } from "./password.service";

describe("PasswordService", () => {
  const service = new PasswordService();

  it("hashes and verifies a password", async () => {
    const hash = await service.hash("senha-bem-comprida-123");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await service.verify(hash, "senha-bem-comprida-123")).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await service.hash("senha-bem-comprida-123");
    expect(await service.verify(hash, "senha-errada-comprida")).toBe(false);
  });

  it("never produces the same hash twice for the same password", async () => {
    const a = await service.hash("senha-bem-comprida-123");
    const b = await service.hash("senha-bem-comprida-123");
    expect(a).not.toBe(b); // salt aleatório embutido no encoding
  });

  it("refuses to hash a password larger than 1 KiB", async () => {
    await expect(service.hash("a".repeat(1025))).rejects.toBeInstanceOf(AppError);
  });

  it("returns false instead of burning CPU when verifying an oversized password", async () => {
    const hash = await service.hash("senha-bem-comprida-123");
    expect(await service.verify(hash, "a".repeat(1025))).toBe(false);
  });

  it("exposes a dummy hash that verifies against nothing", async () => {
    expect(await service.verify(service.DUMMY_HASH, "qualquer-coisa")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @consusimples/api test -- password.service`
Expected: FAIL — `Cannot find module './password.service'`.

- [ ] **Step 3: Implementar**

Adicionar `"argon2": "^0.41.1"` às `dependencies` de `apps/api/package.json` e rodar `pnpm install`.

`apps/api/src/auth/password.service.ts`:
```ts
import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { AppError } from "@/common/app-error";

// Referência OWASP para argon2id. Subir memoryCost até o custo por hash caber
// no orçamento de latência do hardware alvo — medir na VPS antes de fixar.
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

// argon2 não trunca como bcrypt: sem teto, uma "senha" de 1 MB é CPU e RAM de graça
// para o atacante. O teto vale nos dois lados — hash e verify.
const MAX_PASSWORD_BYTES = 1024;
const tooLong = (plain: string) => Buffer.byteLength(plain) > MAX_PASSWORD_BYTES;

@Injectable()
export class PasswordService {
  // Hash de uma senha aleatória descartada. Serve para o login gastar tempo
  // comparável quando o email não existe — sem isso o tempo de resposta enumera contas.
  readonly DUMMY_HASH =
    "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Xf9nBLZ8Yk3Q0m2vP1sT7uWx4yZ6aB8cD0eF2gH4iJk";

  async hash(plain: string): Promise<string> {
    if (tooLong(plain)) throw new AppError("AUTH_002", "Senha muito longa", 400);
    return argon2.hash(plain, OPTIONS);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    if (tooLong(plain)) return false;
    try {
      // salt e parâmetros vêm dentro do hash
      return await argon2.verify(hash, plain);
    } catch {
      // hash malformado (o DUMMY_HASH inclusive) não é exceção de negócio
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, OPTIONS);
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @consusimples/api test -- password.service`
Expected: PASS, 6 testes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/password.service.ts apps/api/src/auth/password.service.spec.ts apps/api/package.json
git commit -m "feat(api): hash passwords with argon2id and cap password size"
```

---

### Task 5: Emissão e rotação de tokens

**Files:**
- Create: `apps/api/src/auth/token.service.ts`
- Test: `apps/api/test/token.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 3), `env.JWT_ACCESS_SECRET`, `env.JWT_REFRESH_SECRET` (Task 2), factories (Task 3)
- Produces: `TokenService` com
  - `issueAccessToken(payload: AuthUser): Promise<string>`
  - `verifyAccessToken(token: string): Promise<AuthUser>`
  - `issueRefreshToken(userId: string, familyId?: string): Promise<string>`
  - `rotateRefreshToken(raw: string): Promise<{ userId: string; refreshToken: string }>`
  - `revokeFamilyByUser(userId: string): Promise<void>`
  - `type AuthUser = { sub: string; tenantId: string; role: UserRole }`

- [ ] **Step 1: Escrever o teste (falha primeiro)**

`apps/api/test/token.service.spec.ts`:
```ts
import { JwtService } from "@nestjs/jwt";
import { TokenService } from "@/auth/token.service";
import { PrismaService } from "@/prisma/prisma.service";
import { AppError } from "@/common/app-error";
import { makeTenant, makeUser } from "./factories";
import { resetDb, prisma } from "./setup";

describe("TokenService", () => {
  const prismaService = new PrismaService();
  const service = new TokenService(prismaService, new JwtService({}));

  beforeEach(resetDb);
  afterAll(async () => {
    await prismaService.$disconnect();
    await prisma.$disconnect();
  });

  it("issues an access token that verifies back to the same claims", async () => {
    const token = await service.issueAccessToken({ sub: "u1", tenantId: "t1", role: "OWNER" });
    const claims = await service.verifyAccessToken(token);
    expect(claims).toMatchObject({ sub: "u1", tenantId: "t1", role: "OWNER" });
  });

  it("rejects a tampered access token", async () => {
    const token = await service.issueAccessToken({ sub: "u1", tenantId: "t1", role: "OWNER" });
    await expect(service.verifyAccessToken(`${token}x`)).rejects.toBeInstanceOf(AppError);
  });

  it("stores only the hash of the refresh token, never the raw value", async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    const raw = await service.issueRefreshToken(user.id);
    const rows = await prisma.refreshToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toBe(raw);
    expect(rows[0]!.tokenHash).toHaveLength(64); // sha256 em hex
  });

  it("rotates: revokes the old token and issues a new one in the same family", async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    const first = await service.issueRefreshToken(user.id);
    const { refreshToken: second, userId } = await service.rotateRefreshToken(first);

    expect(userId).toBe(user.id);
    expect(second).not.toBe(first);
    const rows = await prisma.refreshToken.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.revokedAt).not.toBeNull();
    expect(rows[0]!.replacedBy).toBe(rows[1]!.id);
    expect(rows[1]!.familyId).toBe(rows[0]!.familyId);
  });

  it("detects reuse: replaying a rotated token revokes the whole family", async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    const first = await service.issueRefreshToken(user.id);
    await service.rotateRefreshToken(first);

    await expect(service.rotateRefreshToken(first)).rejects.toBeInstanceOf(AppError);

    const rows = await prisma.refreshToken.findMany();
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });

  it("rejects an unknown refresh token", async () => {
    await expect(service.rotateRefreshToken("nao-existe")).rejects.toBeInstanceOf(AppError);
  });

  it("rejects an expired refresh token", async () => {
    const tenant = await makeTenant();
    const user = await makeUser(tenant.id);
    const raw = await service.issueRefreshToken(user.id);
    await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(service.rotateRefreshToken(raw)).rejects.toBeInstanceOf(AppError);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @consusimples/api test -- token.service`
Expected: FAIL — `Cannot find module '@/auth/token.service'`.

- [ ] **Step 3: Implementar**

Adicionar `"@nestjs/jwt": "^11.0.0"` às `dependencies` e rodar `pnpm install`.

`apps/api/src/auth/token.service.ts`:
```ts
import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { UserRole } from "@prisma/client";
import { AppError } from "@/common/app-error";
import { env } from "@/config/env";
import { PrismaService } from "@/prisma/prisma.service";

export type AuthUser = { sub: string; tenantId: string; role: UserRole };

const ACCESS_TTL = "15m";
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// sha256 sem salt: precisa ser determinístico para o WHERE token_hash = $1.
// O que impede pré-computação é a entropia dos 32 bytes de CSPRNG, não o hash.
const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async issueAccessToken(payload: AuthUser): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: env.JWT_ACCESS_SECRET,
      expiresIn: ACCESS_TTL,
    });
  }

  async verifyAccessToken(token: string): Promise<AuthUser> {
    try {
      const claims = await this.jwt.verifyAsync<AuthUser>(token, {
        secret: env.JWT_ACCESS_SECRET,
      });
      return { sub: claims.sub, tenantId: claims.tenantId, role: claims.role };
    } catch {
      throw new AppError("AUTH_001", "Sessão inválida", 401);
    }
  }

  async issueRefreshToken(userId: string, familyId?: string): Promise<string> {
    const raw = randomBytes(32).toString("base64url");
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId: familyId ?? randomUUID(),
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return raw;
  }

  async rotateRefreshToken(raw: string): Promise<{ userId: string; refreshToken: string }> {
    const tokenHash = hashToken(raw);

    const { userId, familyId } = await this.prisma.$transaction(async (tx) => {
      const current = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!current) throw new AppError("AUTH_001", "Sessão inválida", 401);

      // Reuso: o token já rotacionado voltou. Ele vazou — mata a linhagem inteira.
      if (current.revokedAt) {
        await tx.refreshToken.updateMany({
          where: { familyId: current.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        throw new AppError("AUTH_003", "Sessão revogada", 401);
      }

      if (current.expiresAt <= new Date()) {
        throw new AppError("AUTH_001", "Sessão inválida", 401);
      }

      // updateMany com revokedAt: null é o lock otimista — duas rotações
      // simultâneas com o mesmo token: só uma afeta linha, a outra vê 0.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count === 0) throw new AppError("AUTH_001", "Sessão inválida", 401);

      return { userId: current.userId, familyId: current.familyId, currentId: current.id };
    });

    const refreshToken = await this.issueRefreshToken(userId, familyId);
    const created = await this.prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashToken(refreshToken) },
    });
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, replacedBy: null },
      data: { replacedBy: created.id },
    });

    return { userId, refreshToken };
  }

  async revokeFamilyByUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @consusimples/api test -- token.service`
Expected: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/token.service.ts apps/api/test/token.service.spec.ts apps/api/package.json
git commit -m "feat(api): issue access tokens and rotate refresh tokens with reuse detection"
```

---

### Task 6: Guards globais de autenticação e papel

**Files:**
- Create: `apps/api/src/auth/jwt-auth.guard.ts`, `apps/api/src/auth/roles.guard.ts`
- Modify: `apps/api/src/common/decorators.ts`, `apps/api/src/app.module.ts`
- Test: `apps/api/test/guards.e2e-spec.ts`

**Interfaces:**
- Consumes: `TokenService.verifyAccessToken` e `AuthUser` (Task 5), `IS_PUBLIC`/`@Public` (Task 2)
- Produces:
  - `@Roles(...roles: UserRole[])` e `ROLES_KEY`
  - `@CurrentUser()` — injeta o `AuthUser` do request
  - `JwtAuthGuard` e `RolesGuard` registrados como `APP_GUARD`, nessa ordem
  - `req.user: AuthUser` disponível em toda rota autenticada

- [ ] **Step 1: Escrever o teste e2e (falha primeiro)**

`apps/api/test/guards.e2e-spec.ts`:
```ts
import { Controller, Get, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";
import { CurrentUser, Public, Roles } from "@/common/decorators";
import { TokenService, type AuthUser } from "@/auth/token.service";

@Controller("guard-probe")
class ProbeController {
  @Public()
  @Get("open")
  open() {
    return { ok: true };
  }

  @Get("closed")
  closed(@CurrentUser() user: AuthUser) {
    return { tenantId: user.tenantId };
  }

  @Roles("OWNER", "MANAGER")
  @Get("managers-only")
  managers() {
    return { ok: true };
  }
}

describe("global guards", () => {
  let app: INestApplication;
  let tokens: TokenService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    tokens = app.get(TokenService);
  });

  afterAll(async () => app.close());

  const bearer = async (role: AuthUser["role"]) =>
    `Bearer ${await tokens.issueAccessToken({ sub: "u1", tenantId: "t1", role })}`;

  it("allows a route marked @Public without a token", async () => {
    await request(app.getHttpServer()).get("/guard-probe/open").expect(200, { ok: true });
  });

  it("denies a route without @Public when there is no token", async () => {
    await request(app.getHttpServer()).get("/guard-probe/closed").expect(401);
  });

  it("denies a malformed authorization header", async () => {
    await request(app.getHttpServer())
      .get("/guard-probe/closed")
      .set("authorization", "Token abc")
      .expect(401);
  });

  it("injects the authenticated user into the handler", async () => {
    await request(app.getHttpServer())
      .get("/guard-probe/closed")
      .set("authorization", await bearer("WAITER"))
      .expect(200, { tenantId: "t1" });
  });

  it("allows a role listed in @Roles", async () => {
    await request(app.getHttpServer())
      .get("/guard-probe/managers-only")
      .set("authorization", await bearer("MANAGER"))
      .expect(200, { ok: true });
  });

  it("denies a role not listed in @Roles with 403", async () => {
    await request(app.getHttpServer())
      .get("/guard-probe/managers-only")
      .set("authorization", await bearer("WAITER"))
      .expect(403);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @consusimples/api test -- guards.e2e`
Expected: FAIL — `Roles is not exported` / rota `/guard-probe/closed` responde 200 em vez de 401.

- [ ] **Step 3: Estender os decorators**

Substituir `apps/api/src/common/decorators.ts` por:
```ts
import { createParamDecorator, type ExecutionContext, SetMetadata } from "@nestjs/common";
import type { UserRole } from "@prisma/client";
import type { AuthUser } from "@/auth/token.service";

export const IS_PUBLIC = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = "roles";
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
```

- [ ] **Step 4: Implementar os guards**

`apps/api/src/auth/jwt-auth.guard.ts`:
```ts
import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AppError } from "@/common/app-error";
import { IS_PUBLIC } from "@/common/decorators";
import { TokenService } from "./token.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // getAllAndOverride: o handler pode marcar público um método de controller privado.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const [scheme, token] = String(req.headers.authorization ?? "").split(" ");
    if (scheme !== "Bearer" || !token) throw new AppError("AUTH_001", "Sessão inválida", 401);

    // Erro de verificação sobe como 401. Nunca `catch {}` seguindo com req.user indefinido.
    req.user = await this.tokens.verifyAccessToken(token);
    return true;
  }
}
```

`apps/api/src/auth/roles.guard.ts`:
```ts
import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { UserRole } from "@prisma/client";
import { AppError } from "@/common/app-error";
import { ROLES_KEY } from "@/common/decorators";
import type { AuthUser } from "./token.service";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;

    const user = ctx.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) throw new AppError("AUTH_001", "Sessão inválida", 401);
    if (!required.includes(user.role)) {
      throw new AppError("AUTH_403", "Permissão insuficiente", 403);
    }
    return true;
  }
}
```

- [ ] **Step 5: Registrar os guards como globais**

Criar `apps/api/src/auth/auth.module.ts`:
```ts
import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [PasswordService, TokenService],
  exports: [PasswordService, TokenService],
})
export class AuthModule {}
```

Em `apps/api/src/app.module.ts`, adicionar `AuthModule` aos `imports` e os guards aos `providers`. **A ordem importa**: o de autenticação é registrado primeiro, senão o `RolesGuard` roda sem `req.user`.
```ts
import { APP_GUARD } from "@nestjs/core";
import { AuthModule } from "@/auth/auth.module";
import { JwtAuthGuard } from "@/auth/jwt-auth.guard";
import { RolesGuard } from "@/auth/roles.guard";

// imports: [LoggerModule.forRoot({ ... }), PrismaModule, AuthModule],
// providers: [
//   { provide: APP_FILTER, useClass: AllExceptionsFilter },
//   { provide: APP_GUARD, useClass: JwtAuthGuard },
//   { provide: APP_GUARD, useClass: RolesGuard },
// ],
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @consusimples/api test -- guards.e2e`
Expected: PASS, 6 testes.

- [ ] **Step 7: Confirmar que o health continua público**

Run: `pnpm --filter @consusimples/api test`
Expected: todos os specs passam — nenhuma rota de health quebrou com os guards globais.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/auth apps/api/src/common/decorators.ts apps/api/src/app.module.ts apps/api/test/guards.e2e-spec.ts
git commit -m "feat(api): deny requests by default with global auth and role guards"
```

---

### Task 7: Signup e verificação de email

**Files:**
- Create: `packages/validation/package.json`, `packages/validation/tsconfig.json`, `packages/validation/src/index.ts`, `packages/validation/src/auth.ts`, `apps/api/src/mail/mailer.port.ts`, `apps/api/src/mail/resend.mailer.ts`, `apps/api/src/mail/mail.module.ts`, `apps/api/src/auth/auth.repository.ts`, `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Test: `apps/api/test/signup.e2e-spec.ts`

**Interfaces:**
- Consumes: `PasswordService` (Task 4), `TokenService` (Task 5), `PrismaService` (Task 3), `ZodValidationPipe` (Task 2)
- Produces:
  - `signupSchema`, `verifyEmailSchema`, `loginSchema`, `refreshSchema` em `@consusimples/validation`
  - `MAILER` (símbolo de injeção) e `interface Mailer { sendEmailVerification(to: string, link: string): Promise<void> }`
  - `POST /auth/signup` → 201 `{ tenantId: string }`
  - `POST /auth/verify-email` → 200 `{ ok: true }`

- [ ] **Step 1: Criar o package de validação**

`packages/validation/package.json`:
```json
{
  "name": "@consusimples/validation",
  "private": true,
  "version": "0.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "eslint src --max-warnings 0",
    "typecheck": "tsc --noEmit",
    "test": "echo no tests"
  },
  "dependencies": { "zod": "^3.24.0" },
  "devDependencies": { "typescript": "^5.7.0", "eslint": "^9.17.0" }
}
```

`packages/validation/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*"]
}
```

`packages/validation/src/auth.ts`:
```ts
import { z } from "zod";

// Mínimo 12 caracteres. Comprimento vence composição obrigatória de caracteres especiais.
const password = z.string().min(12).max(1024);
const email = z.string().email().max(254).toLowerCase().trim();

export const signupSchema = z
  .object({
    restaurantName: z.string().min(2).max(120).trim(),
    ownerName: z.string().min(2).max(120).trim(),
    email,
    password,
  })
  .strict();
export type SignupInput = z.infer<typeof signupSchema>;

export const verifyEmailSchema = z.object({ token: z.string().min(10).max(200) }).strict();
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const loginSchema = z.object({ email, password: z.string().min(1).max(1024) }).strict();
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(10).max(200) }).strict();
export type RefreshInput = z.infer<typeof refreshSchema>;
```

`packages/validation/src/index.ts`:
```ts
export * from "./auth";
```

- [ ] **Step 2: Escrever o teste e2e (falha primeiro)**

`apps/api/test/signup.e2e-spec.ts`:
```ts
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";
import { MAILER, type Mailer } from "@/mail/mailer.port";
import { prisma, resetDb } from "./setup";

class FakeMailer implements Mailer {
  sent: { to: string; link: string }[] = [];
  async sendEmailVerification(to: string, link: string) {
    this.sent.push({ to, link });
  }
}

describe("POST /auth/signup", () => {
  let app: INestApplication;
  const mailer = new FakeMailer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAILER)
      .useValue(mailer)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    await resetDb();
    mailer.sent = [];
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const payload = {
    restaurantName: "Bar do Zé",
    ownerName: "José",
    email: "ze@bar.com",
    password: "senha-bem-comprida",
  };

  it("creates tenant and owner in a single transaction", async () => {
    const res = await request(app.getHttpServer()).post("/auth/signup").send(payload).expect(201);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: res.body.tenantId } });
    expect(tenant.status).toBe("PENDING_VERIFICATION");

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "ze@bar.com" } });
    expect(user.role).toBe("OWNER");
    expect(user.tenantId).toBe(tenant.id);
    expect(user.passwordHash).not.toBe(payload.password);
  });

  it("sends exactly one verification email with a link to the web app", async () => {
    await request(app.getHttpServer()).post("/auth/signup").send(payload).expect(201);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe("ze@bar.com");
    expect(mailer.sent[0]!.link).toContain("/verificar-email?token=");
  });

  it("stores only the hash of the verification token", async () => {
    await request(app.getHttpServer()).post("/auth/signup").send(payload).expect(201);
    const rawToken = new URL(mailer.sent[0]!.link).searchParams.get("token")!;
    const row = await prisma.emailVerificationToken.findFirstOrThrow();
    expect(row.tokenHash).not.toBe(rawToken);
  });

  it("rejects a duplicated email without leaking that it exists", async () => {
    await request(app.getHttpServer()).post("/auth/signup").send(payload).expect(201);
    const res = await request(app.getHttpServer()).post("/auth/signup").send(payload).expect(409);
    expect(res.body.error.code).toBe("AUTH_004");
    expect(await prisma.tenant.count()).toBe(1); // nada meio-criado
  });

  it("rejects a password shorter than 12 characters with VALIDATION_001", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/signup")
      .send({ ...payload, password: "curta" })
      .expect(422);
    expect(res.body.error.code).toBe("VALIDATION_001");
  });

  it("rejects unknown fields", async () => {
    await request(app.getHttpServer())
      .post("/auth/signup")
      .send({ ...payload, role: "OWNER" })
      .expect(422);
  });

  it("activates the tenant when the verification token is used", async () => {
    const res = await request(app.getHttpServer()).post("/auth/signup").send(payload).expect(201);
    const token = new URL(mailer.sent[0]!.link).searchParams.get("token")!;

    await request(app.getHttpServer())
      .post("/auth/verify-email")
      .send({ token })
      .expect(200, { ok: true });

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: res.body.tenantId } });
    expect(tenant.status).toBe("ACTIVE");
  });

  it("refuses to reuse a verification token", async () => {
    await request(app.getHttpServer()).post("/auth/signup").send(payload).expect(201);
    const token = new URL(mailer.sent[0]!.link).searchParams.get("token")!;
    await request(app.getHttpServer()).post("/auth/verify-email").send({ token }).expect(200);
    await request(app.getHttpServer()).post("/auth/verify-email").send({ token }).expect(400);
  });

  it("refuses an expired verification token", async () => {
    await request(app.getHttpServer()).post("/auth/signup").send(payload).expect(201);
    const token = new URL(mailer.sent[0]!.link).searchParams.get("token")!;
    await prisma.emailVerificationToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(app.getHttpServer()).post("/auth/verify-email").send({ token }).expect(400);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @consusimples/api test -- signup.e2e`
Expected: FAIL — `Cannot find module '@/mail/mailer.port'`.

- [ ] **Step 4: Implementar o mailer**

Adicionar `"resend": "^4.0.0"` às `dependencies` da API e rodar `pnpm install`.

`apps/api/src/mail/mailer.port.ts`:
```ts
// Token de injeção: há duas implementações reais (Resend em produção, fake nos testes),
// que é exatamente o caso em que a indireção se paga.
export const MAILER = Symbol("MAILER");

export interface Mailer {
  sendEmailVerification(to: string, link: string): Promise<void>;
}
```

`apps/api/src/mail/resend.mailer.ts`:
```ts
import { Injectable, Logger } from "@nestjs/common";
import { Resend } from "resend";
import { env } from "@/config/env";
import type { Mailer } from "./mailer.port";

@Injectable()
export class ResendMailer implements Mailer {
  private readonly logger = new Logger(ResendMailer.name);
  private readonly client = new Resend(env.RESEND_API_KEY);

  async sendEmailVerification(to: string, link: string): Promise<void> {
    const { error } = await this.client.emails.send({
      from: env.MAIL_FROM,
      to,
      subject: "Confirme seu email — consusimples",
      html: `<p>Confirme seu cadastro para começar a usar o consusimples.</p>
             <p><a href="${link}">Confirmar email</a></p>
             <p>O link vale por 24 horas.</p>`,
    });
    // Email mascarado: endereço completo em log é dado pessoal replicado.
    if (error) {
      this.logger.error({ to: to.replace(/(.).*(@.*)/, "$1***$2") }, "verification email failed");
      throw error;
    }
  }
}
```

`apps/api/src/mail/mail.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { MAILER } from "./mailer.port";
import { ResendMailer } from "./resend.mailer";

@Module({
  providers: [{ provide: MAILER, useClass: ResendMailer }],
  exports: [MAILER],
})
export class MailModule {}
```

- [ ] **Step 5: Implementar o repository e o service**

`apps/api/src/auth/auth.repository.ts`:
```ts
import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "@/prisma/prisma.service";

const slugify = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Busca por email é global de propósito: o email é único em todo o sistema
  // e é o que identifica o usuário antes de existir tenant no contexto.
  findUserByEmailUnscoped(email: string) {
    return this.prisma.user.findUnique({ where: { email }, include: { tenant: true } });
  }

  async createTenantWithOwner(input: {
    restaurantName: string;
    ownerName: string;
    email: string;
    passwordHash: string;
    verificationTokenHash: string;
    verificationExpiresAt: Date;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: input.restaurantName,
          slug: `${slugify(input.restaurantName)}-${Date.now().toString(36)}`,
        },
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: input.email,
          name: input.ownerName,
          role: "OWNER",
          passwordHash: input.passwordHash,
        },
      });
      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: input.verificationTokenHash,
          expiresAt: input.verificationExpiresAt,
        },
      });
      return { tenant, user };
    });
  }

  async consumeVerificationToken(rawToken: string) {
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.emailVerificationToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (!row || row.usedAt || row.expiresAt <= new Date()) return null;

      // updateMany com usedAt: null — dois cliques simultâneos, só um consome.
      const { count } = await tx.emailVerificationToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count === 0) return null;

      await tx.tenant.update({ where: { id: row.user.tenantId }, data: { status: "ACTIVE" } });
      return row.user;
    });
  }

  markLogin(userId: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  }

  updatePasswordHash(userId: string, passwordHash: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }
}
```

`apps/api/src/auth/auth.service.ts`:
```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { SignupInput } from "@consusimples/validation";
import { AppError } from "@/common/app-error";
import { env } from "@/config/env";
import { MAILER, type Mailer } from "@/mail/mailer.port";
import { AuthRepository } from "./auth.repository";
import { PasswordService } from "./password.service";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const maskEmail = (e: string) => e.replace(/(.).*(@.*)/, "$1***$2");

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repo: AuthRepository,
    private readonly passwords: PasswordService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  async signup(input: SignupInput): Promise<{ tenantId: string }> {
    const existing = await this.repo.findUserByEmailUnscoped(input.email);
    if (existing) throw new AppError("AUTH_004", "Não foi possível concluir o cadastro", 409);

    const passwordHash = await this.passwords.hash(input.password);
    const rawToken = randomBytes(32).toString("base64url");

    const { tenant, user } = await this.repo.createTenantWithOwner({
      restaurantName: input.restaurantName,
      ownerName: input.ownerName,
      email: input.email,
      passwordHash,
      verificationTokenHash: createHash("sha256").update(rawToken).digest("hex"),
      verificationExpiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    });

    await this.mailer.sendEmailVerification(
      user.email,
      `${env.WEB_BASE_URL}/verificar-email?token=${rawToken}`,
    );

    this.logger.log(
      { event: "signup", tenantId: tenant.id, userId: user.id, email: maskEmail(user.email) },
      "tenant created",
    );
    return { tenantId: tenant.id };
  }

  async verifyEmail(token: string): Promise<{ ok: true }> {
    const user = await this.repo.consumeVerificationToken(token);
    if (!user) throw new AppError("AUTH_005", "Link inválido ou expirado", 400);
    this.logger.log({ event: "email_verified", userId: user.id, tenantId: user.tenantId }, "email verified");
    return { ok: true };
  }
}
```

- [ ] **Step 6: Implementar o controller**

`apps/api/src/auth/auth.controller.ts`:
```ts
import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { signupSchema, verifyEmailSchema, type SignupInput, type VerifyEmailInput } from "@consusimples/validation";
import { Public } from "@/common/decorators";
import { ZodValidationPipe } from "@/common/zod-validation.pipe";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("signup")
  signup(@Body(new ZodValidationPipe(signupSchema)) dto: SignupInput) {
    return this.auth.signup(dto);
  }

  @Public()
  @HttpCode(200)
  @Post("verify-email")
  verifyEmail(@Body(new ZodValidationPipe(verifyEmailSchema)) dto: VerifyEmailInput) {
    return this.auth.verifyEmail(dto.token);
  }
}
```

Atualizar `apps/api/src/auth/auth.module.ts`:
```ts
import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MailModule } from "@/mail/mail.module";
import { AuthController } from "./auth.controller";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";

@Global()
@Module({
  imports: [JwtModule.register({}), MailModule],
  controllers: [AuthController],
  providers: [PasswordService, TokenService, AuthRepository, AuthService],
  exports: [PasswordService, TokenService],
})
export class AuthModule {}
```

Adicionar `"@consusimples/validation": "workspace:*"` já está nas dependências da API desde a Task 2; rodar `pnpm install` e `pnpm --filter @consusimples/validation build`.

- [ ] **Step 7: Rodar e ver passar**

Run: `pnpm --filter @consusimples/api test -- signup.e2e`
Expected: PASS, 9 testes.

- [ ] **Step 8: Commit**

```bash
git add packages/validation apps/api/src/mail apps/api/src/auth apps/api/test/signup.e2e-spec.ts apps/api/package.json
git commit -m "feat(api): public signup with tenant provisioning and email verification"
```

---

### Task 8: Login, refresh, logout e rate limit

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.controller.ts`, `apps/api/src/app.module.ts`, `apps/api/package.json`
- Create: `apps/api/src/auth/tenant.throttler.guard.ts`
- Test: `apps/api/test/login.e2e-spec.ts`

**Interfaces:**
- Consumes: `AuthRepository`, `PasswordService`, `TokenService` (Tasks 4, 5, 7)
- Produces:
  - `POST /auth/login` → 200 `{ accessToken, refreshToken, user: { id, name, role, tenantId } }`
  - `POST /auth/refresh` → 200 `{ accessToken, refreshToken }`
  - `POST /auth/logout` → 204
  - `AppThrottlerGuard` global com tracker `ip:subject`

- [ ] **Step 1: Escrever o teste e2e (falha primeiro)**

`apps/api/test/login.e2e-spec.ts`:
```ts
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";
import { PasswordService } from "@/auth/password.service";
import { makeTenant, makeUser } from "./factories";
import { prisma, resetDb } from "./setup";

const PASSWORD = "senha-bem-comprida";

describe("auth session", () => {
  let app: INestApplication;
  let passwords: PasswordService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    passwords = app.get(PasswordService);
  });

  beforeEach(resetDb);
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const seedUser = async () => {
    const tenant = await makeTenant({ status: "ACTIVE" });
    return makeUser(tenant.id, {
      email: "ze@bar.com",
      passwordHash: await passwords.hash(PASSWORD),
      role: "OWNER",
    });
  };

  it("logs in with the right credentials", async () => {
    const user = await seedUser();
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ze@bar.com", password: PASSWORD })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.user).toEqual({
      id: user.id,
      name: user.name,
      role: "OWNER",
      tenantId: user.tenantId,
    });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("records the login timestamp", async () => {
    const user = await seedUser();
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ze@bar.com", password: PASSWORD })
      .expect(200);
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(fresh.lastLoginAt).not.toBeNull();
  });

  it("answers the same way for wrong password and unknown email", async () => {
    await seedUser();
    const wrongPassword = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ze@bar.com", password: "outra-senha-longa" })
      .expect(401);
    const unknownEmail = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ninguem@bar.com", password: "outra-senha-longa" })
      .expect(401);

    expect(wrongPassword.body.error.code).toBe(unknownEmail.body.error.code);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it("refuses to log in while the tenant is pending verification", async () => {
    const tenant = await makeTenant({ status: "PENDING_VERIFICATION" });
    await makeUser(tenant.id, {
      email: "novo@bar.com",
      passwordHash: await passwords.hash(PASSWORD),
    });
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "novo@bar.com", password: PASSWORD })
      .expect(403);
    expect(res.body.error.code).toBe("AUTH_006");
  });

  it("refuses to log in a disabled user", async () => {
    const user = await seedUser();
    await prisma.user.update({ where: { id: user.id }, data: { status: "DISABLED" } });
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ze@bar.com", password: PASSWORD })
      .expect(401);
  });

  it("exchanges a refresh token for a new pair", async () => {
    await seedUser();
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ze@bar.com", password: PASSWORD })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);

    expect(res.body.refreshToken).not.toBe(login.body.refreshToken);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it("kills the session family when a refresh token is replayed", async () => {
    await seedUser();
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ze@bar.com", password: PASSWORD })
      .expect(200);

    const rotated = await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);

    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);

    // o token legítimo mais recente também morre: a linhagem inteira foi revogada
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(401);
  });

  it("logout revokes the refresh token", async () => {
    await seedUser();
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ze@bar.com", password: PASSWORD })
      .expect(200);

    await request(app.getHttpServer())
      .post("/auth/logout")
      .set("authorization", `Bearer ${login.body.accessToken}`)
      .send({ refreshToken: login.body.refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });

  it("rate limits repeated login attempts with 429", async () => {
    await seedUser();
    const attempt = () =>
      request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "ze@bar.com", password: "senha-errada-longa" });

    for (let i = 0; i < 5; i++) await attempt().expect(401);
    await attempt().expect(429);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @consusimples/api test -- login.e2e`
Expected: FAIL — rota `/auth/login` responde 404.

- [ ] **Step 3: Implementar o throttler**

Adicionar `"@nestjs/throttler": "^6.4.0"` às `dependencies` e rodar `pnpm install`.

`apps/api/src/auth/tenant.throttler.guard.ts`:
```ts
import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    // req.ip só é confiável porque `trust proxy` está configurado com TRUST_PROXY_HOPS.
    // NÃO ler req.headers['x-forwarded-for']: é o valor cru, forjável pelo cliente.
    const ip = req.ip ?? "unknown";
    // Misturar identidade em rota de credencial: impede varrer contas de um IP
    // e impede distribuir ataque a uma conta a partir de muitos IPs.
    const subject = req.user?.sub ?? req.body?.email?.toLowerCase?.();
    return subject ? `${ip}:${subject}` : ip;
  }
}
```

Em `apps/api/src/app.module.ts`, adicionar aos `imports` e `providers`:
```ts
import { ThrottlerModule } from "@nestjs/throttler";
import { AppThrottlerGuard } from "@/auth/tenant.throttler.guard";

// imports: [..., ThrottlerModule.forRoot({ throttlers: [{ name: "default", ttl: 60_000, limit: 100 }] })],
// providers: [
//   { provide: APP_FILTER, useClass: AllExceptionsFilter },
//   { provide: APP_GUARD, useClass: AppThrottlerGuard },
//   { provide: APP_GUARD, useClass: JwtAuthGuard },
//   { provide: APP_GUARD, useClass: RolesGuard },
// ],
```

O throttler vem antes dos guards de auth: bloquear força bruta não deve custar uma verificação de token.

- [ ] **Step 4: Implementar login, refresh e logout no service**

Adicionar a `apps/api/src/auth/auth.service.ts` — no topo, os imports novos:
```ts
import type { LoginInput } from "@consusimples/validation";
import { TokenService, type AuthUser } from "./token.service";
```

Injetar `TokenService` no construtor (`private readonly tokens: TokenService,`) e acrescentar os métodos:
```ts
  async login(input: LoginInput, ip: string) {
    const user = await this.repo.findUserByEmailUnscoped(input.email);

    // Email inexistente gasta tempo comparável: sem isso o tempo de resposta enumera contas.
    const hash = user?.passwordHash ?? this.passwords.DUMMY_HASH;
    const ok = await this.passwords.verify(hash, input.password);

    if (!user || !ok || user.status === "DISABLED") {
      this.logger.warn(
        { event: "login_failed", email: maskEmail(input.email), ip },
        "login failed",
      );
      // Mesma mensagem e mesmo código para senha errada, email inexistente e usuário desativado.
      throw new AppError("AUTH_001", "Email ou senha inválidos", 401);
    }

    if (user.tenant.status !== "ACTIVE") {
      throw new AppError("AUTH_006", "Confirme seu email para acessar", 403);
    }

    if (this.passwords.needsRehash(user.passwordHash)) {
      await this.repo.updatePasswordHash(user.id, await this.passwords.hash(input.password));
    }

    const claims: AuthUser = { sub: user.id, tenantId: user.tenantId, role: user.role };
    const [accessToken, refreshToken] = await Promise.all([
      this.tokens.issueAccessToken(claims),
      this.tokens.issueRefreshToken(user.id),
    ]);
    await this.repo.markLogin(user.id);

    this.logger.log(
      { event: "login", userId: user.id, tenantId: user.tenantId, ip },
      "login succeeded",
    );

    // Nunca devolver o row do Prisma cru: vaza passwordHash.
    return {
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, role: user.role, tenantId: user.tenantId },
    };
  }

  async refresh(rawToken: string) {
    const { userId, refreshToken } = await this.tokens.rotateRefreshToken(rawToken);
    const user = await this.repo.findUserByIdUnscoped(userId);
    if (!user || user.status === "DISABLED" || user.tenant.status !== "ACTIVE") {
      await this.tokens.revokeFamilyByUser(userId);
      throw new AppError("AUTH_001", "Sessão inválida", 401);
    }
    const accessToken = await this.tokens.issueAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });
    return { accessToken, refreshToken };
  }

  async logout(userId: string) {
    await this.tokens.revokeFamilyByUser(userId);
  }
```

Acrescentar a `apps/api/src/auth/auth.repository.ts`:
```ts
  // Busca sem escopo de tenant: usada só no refresh, onde o tenant ainda vai ser
  // resolvido a partir do próprio usuário. Não usar em rota de recurso.
  findUserByIdUnscoped(id: string) {
    return this.prisma.user.findUnique({ where: { id }, include: { tenant: true } });
  }
```

- [ ] **Step 5: Expor as rotas**

Acrescentar a `apps/api/src/auth/auth.controller.ts`:
```ts
import { HttpCode, Ip, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { loginSchema, refreshSchema, type LoginInput, type RefreshInput } from "@consusimples/validation";
import { CurrentUser } from "@/common/decorators";
import type { AuthUser } from "./token.service";

  @Public()
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @HttpCode(200)
  @Post("login")
  login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginInput, @Ip() ip: string) {
    return this.auth.login(dto, ip);
  }

  @Public()
  @Throttle({ default: { ttl: 900_000, limit: 20 } })
  @HttpCode(200)
  @Post("refresh")
  refresh(@Body(new ZodValidationPipe(refreshSchema)) dto: RefreshInput) {
    return this.auth.refresh(dto.refreshToken);
  }

  @HttpCode(204)
  @Post("logout")
  async logout(@CurrentUser() user: AuthUser) {
    await this.auth.logout(user.sub);
  }
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @consusimples/api test -- login.e2e`
Expected: PASS, 9 testes.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/auth apps/api/src/app.module.ts apps/api/test/login.e2e-spec.ts apps/api/package.json
git commit -m "feat(api): login, refresh rotation, logout and per-route rate limiting"
```

---

### Task 9: Catálogo com escopo de tenant provado

**Files:**
- Create: `packages/validation/src/catalog.ts`, `apps/api/src/common/scope.ts`, `apps/api/src/catalog/category.repository.ts`, `apps/api/src/catalog/category.service.ts`, `apps/api/src/catalog/category.controller.ts`, `apps/api/src/catalog/product.repository.ts`, `apps/api/src/catalog/product.service.ts`, `apps/api/src/catalog/product.controller.ts`, `apps/api/src/catalog/catalog.module.ts`
- Modify: `packages/validation/src/index.ts`, `apps/api/src/app.module.ts`
- Test: `apps/api/test/catalog.e2e-spec.ts`, `apps/api/test/tenant-isolation.e2e-spec.ts`

**Interfaces:**
- Consumes: guards e `@CurrentUser` (Task 6), `ZodValidationPipe` (Task 2)
- Produces:
  - `type Scope = { tenantId: string }` em `@/common/scope`
  - `createCategorySchema`, `updateCategorySchema`, `createProductSchema`, `updateProductSchema` em `@consusimples/validation`
  - `GET/POST /categories`, `PATCH/DELETE /categories/:id`
  - `GET/POST /products`, `PATCH/DELETE /products/:id`

- [ ] **Step 1: Escrever o teste de isolamento (falha primeiro)**

Este é o teste que vira gate de CI. `apps/api/test/tenant-isolation.e2e-spec.ts`:
```ts
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";
import { TokenService } from "@/auth/token.service";
import { makeCategory, makeProduct, makeTenant, makeUser } from "./factories";
import { prisma, resetDb } from "./setup";

describe("tenant isolation", () => {
  let app: INestApplication;
  let tokens: TokenService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    tokens = app.get(TokenService);
  });

  beforeEach(resetDb);
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // Dois restaurantes distintos; o token é sempre do tenant A, os recursos são do tenant B.
  const twoTenants = async () => {
    const [a, b] = await Promise.all([makeTenant(), makeTenant()]);
    const userA = await makeUser(a.id, { role: "OWNER" });
    const categoryB = await makeCategory(b.id);
    const productB = await makeProduct(b.id, categoryB.id);
    const tokenA = await tokens.issueAccessToken({
      sub: userA.id,
      tenantId: a.id,
      role: "OWNER",
    });
    return { tokenA, categoryB, productB, tenantA: a };
  };

  it("never lists resources from another tenant", async () => {
    const { tokenA } = await twoTenants();
    const categories = await request(app.getHttpServer())
      .get("/categories")
      .set("authorization", `Bearer ${tokenA}`)
      .expect(200);
    const products = await request(app.getHttpServer())
      .get("/products")
      .set("authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(categories.body).toEqual([]);
    expect(products.body).toEqual([]);
  });

  it("returns 404 — not 403 — when reading another tenant's product", async () => {
    const { tokenA, productB } = await twoTenants();
    await request(app.getHttpServer())
      .get(`/products/${productB.id}`)
      .set("authorization", `Bearer ${tokenA}`)
      .expect(404);
  });

  it("returns 404 when updating another tenant's product and leaves it untouched", async () => {
    const { tokenA, productB } = await twoTenants();
    await request(app.getHttpServer())
      .patch(`/products/${productB.id}`)
      .set("authorization", `Bearer ${tokenA}`)
      .send({ priceCents: 1 })
      .expect(404);

    const fresh = await prisma.product.findUniqueOrThrow({ where: { id: productB.id } });
    expect(fresh.priceCents).toBe(productB.priceCents);
  });

  it("returns 404 when deleting another tenant's category and leaves it untouched", async () => {
    const { tokenA, categoryB } = await twoTenants();
    await request(app.getHttpServer())
      .delete(`/categories/${categoryB.id}`)
      .set("authorization", `Bearer ${tokenA}`)
      .expect(404);

    expect(await prisma.category.count({ where: { id: categoryB.id } })).toBe(1);
  });

  it("refuses to create a product under another tenant's category", async () => {
    const { tokenA, categoryB } = await twoTenants();
    await request(app.getHttpServer())
      .post("/products")
      .set("authorization", `Bearer ${tokenA}`)
      .send({ name: "Invasor", categoryId: categoryB.id, priceCents: 100 })
      .expect(404);
  });

  it("ignores a tenantId sent in the body", async () => {
    const { tokenA, tenantA } = await twoTenants();
    const other = await makeTenant();
    await request(app.getHttpServer())
      .post("/categories")
      .set("authorization", `Bearer ${tokenA}`)
      .send({ name: "Bebidas", tenantId: other.id })
      .expect(422); // schema é .strict(): campo desconhecido é rejeitado, não ignorado

    const created = await request(app.getHttpServer())
      .post("/categories")
      .set("authorization", `Bearer ${tokenA}`)
      .send({ name: "Bebidas" })
      .expect(201);
    expect(created.body.tenantId).toBeUndefined(); // tenantId não vaza na resposta
    const row = await prisma.category.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.tenantId).toBe(tenantA.id);
  });
});
```

- [ ] **Step 2: Escrever o teste funcional do catálogo**

`apps/api/test/catalog.e2e-spec.ts`:
```ts
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";
import { TokenService } from "@/auth/token.service";
import { makeTenant, makeUser } from "./factories";
import { prisma, resetDb } from "./setup";

describe("catalog", () => {
  let app: INestApplication;
  let tokens: TokenService;
  let ownerToken: string;
  let waiterToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    tokens = app.get(TokenService);
  });

  beforeEach(async () => {
    await resetDb();
    const tenant = await makeTenant();
    const owner = await makeUser(tenant.id, { role: "OWNER" });
    const waiter = await makeUser(tenant.id, { role: "WAITER" });
    ownerToken = await tokens.issueAccessToken({ sub: owner.id, tenantId: tenant.id, role: "OWNER" });
    waiterToken = await tokens.issueAccessToken({ sub: waiter.id, tenantId: tenant.id, role: "WAITER" });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const auth = (t: string) => ({ authorization: `Bearer ${t}` });

  it("creates a category and lists it", async () => {
    const created = await request(app.getHttpServer())
      .post("/categories")
      .set(auth(ownerToken))
      .send({ name: "Bebidas", sortOrder: 1 })
      .expect(201);

    expect(created.body).toEqual({
      id: expect.any(String),
      name: "Bebidas",
      sortOrder: 1,
      active: true,
    });

    const list = await request(app.getHttpServer()).get("/categories").set(auth(ownerToken)).expect(200);
    expect(list.body).toHaveLength(1);
  });

  it("rejects a duplicated category name in the same tenant", async () => {
    await request(app.getHttpServer())
      .post("/categories")
      .set(auth(ownerToken))
      .send({ name: "Bebidas" })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post("/categories")
      .set(auth(ownerToken))
      .send({ name: "Bebidas" })
      .expect(409);
    expect(res.body.error.code).toBe("CATALOG_001");
  });

  it("lets a waiter read the catalog but not change it", async () => {
    await request(app.getHttpServer()).get("/categories").set(auth(waiterToken)).expect(200);
    await request(app.getHttpServer())
      .post("/categories")
      .set(auth(waiterToken))
      .send({ name: "Sobremesas" })
      .expect(403);
  });

  it("creates a product with price in cents", async () => {
    const category = await request(app.getHttpServer())
      .post("/categories")
      .set(auth(ownerToken))
      .send({ name: "Lanches" })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post("/products")
      .set(auth(ownerToken))
      .send({ name: "X-Salada", categoryId: category.body.id, priceCents: 2350 })
      .expect(201);

    expect(created.body).toEqual({
      id: expect.any(String),
      name: "X-Salada",
      description: null,
      categoryId: category.body.id,
      priceCents: 2350,
      available: true,
      sortOrder: 0,
    });
  });

  it("rejects a fractional or negative price", async () => {
    const category = await request(app.getHttpServer())
      .post("/categories")
      .set(auth(ownerToken))
      .send({ name: "Lanches" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/products")
      .set(auth(ownerToken))
      .send({ name: "X", categoryId: category.body.id, priceCents: 23.5 })
      .expect(422);

    await request(app.getHttpServer())
      .post("/products")
      .set(auth(ownerToken))
      .send({ name: "X", categoryId: category.body.id, priceCents: -1 })
      .expect(422);
  });

  it("updates the price and keeps the product id", async () => {
    const category = await request(app.getHttpServer())
      .post("/categories")
      .set(auth(ownerToken))
      .send({ name: "Lanches" })
      .expect(201);
    const product = await request(app.getHttpServer())
      .post("/products")
      .set(auth(ownerToken))
      .send({ name: "X-Salada", categoryId: category.body.id, priceCents: 2350 })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/products/${product.body.id}`)
      .set(auth(ownerToken))
      .send({ priceCents: 2500 })
      .expect(200);

    expect(updated.body.id).toBe(product.body.id);
    expect(updated.body.priceCents).toBe(2500);
  });

  it("deactivates instead of deleting the row", async () => {
    const category = await request(app.getHttpServer())
      .post("/categories")
      .set(auth(ownerToken))
      .send({ name: "Lanches" })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/categories/${category.body.id}`)
      .set(auth(ownerToken))
      .expect(204);

    const row = await prisma.category.findUniqueOrThrow({ where: { id: category.body.id } });
    expect(row.active).toBe(false); // nada é deletado de verdade
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @consusimples/api test -- catalog.e2e tenant-isolation.e2e`
Expected: FAIL — todas as rotas respondem 404.

- [ ] **Step 4: Escrever os schemas de validação**

`packages/validation/src/catalog.ts`:
```ts
import { z } from "zod";

const uuid = z.string().uuid();

export const createCategorySchema = z
  .object({
    name: z.string().min(1).max(80).trim(),
    sortOrder: z.number().int().min(0).max(9999).default(0),
  })
  .strict();
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial().strict();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const createProductSchema = z
  .object({
    name: z.string().min(1).max(120).trim(),
    description: z.string().max(500).trim().optional(),
    categoryId: uuid,
    // Centavos inteiros. `.int()` rejeita 23.5 antes de virar dinheiro quebrado no banco.
    priceCents: z.number().int().min(0).max(100_000_000),
    available: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(9999).default(0),
  })
  .strict();
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial().strict();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
```

Atualizar `packages/validation/src/index.ts`:
```ts
export * from "./auth";
export * from "./catalog";
```

- [ ] **Step 5: Implementar o `Scope` e os repositories**

`apps/api/src/common/scope.ts`:
```ts
// Todo método de repository recebe Scope. O tipo é o que obriga: não existe
// caminho para consultar sem tenant sem escrever `Unscoped` no nome do método.
export type Scope = { tenantId: string };
```

`apps/api/src/catalog/category.repository.ts`:
```ts
import { Injectable } from "@nestjs/common";
import type { Scope } from "@/common/scope";
import { PrismaService } from "@/prisma/prisma.service";

const SELECT = { id: true, name: true, sortOrder: true, active: true } as const;

@Injectable()
export class CategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(scope: Scope) {
    return this.prisma.category.findMany({
      where: { tenantId: scope.tenantId, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: SELECT,
    });
  }

  // findFirst com tenantId, nunca findUnique por id: findUnique ignora o filtro de tenant.
  findById(scope: Scope, id: string) {
    return this.prisma.category.findFirst({
      where: { id, tenantId: scope.tenantId, active: true },
      select: SELECT,
    });
  }

  create(scope: Scope, data: { name: string; sortOrder: number }) {
    return this.prisma.category.create({
      data: { ...data, tenantId: scope.tenantId },
      select: SELECT,
    });
  }

  // updateMany com tenantId no where: `update` por id único ignoraria o escopo.
  async update(scope: Scope, id: string, data: { name?: string; sortOrder?: number }) {
    const { count } = await this.prisma.category.updateMany({
      where: { id, tenantId: scope.tenantId, active: true },
      data,
    });
    return count;
  }

  async deactivate(scope: Scope, id: string) {
    const { count } = await this.prisma.category.updateMany({
      where: { id, tenantId: scope.tenantId, active: true },
      data: { active: false },
    });
    return count;
  }
}
```

`apps/api/src/catalog/product.repository.ts`:
```ts
import { Injectable } from "@nestjs/common";
import type { Scope } from "@/common/scope";
import { PrismaService } from "@/prisma/prisma.service";

const SELECT = {
  id: true,
  name: true,
  description: true,
  categoryId: true,
  priceCents: true,
  available: true,
  sortOrder: true,
} as const;

type CreateData = {
  name: string;
  description?: string;
  categoryId: string;
  priceCents: number;
  available: boolean;
  sortOrder: number;
};

@Injectable()
export class ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(scope: Scope, categoryId?: string) {
    return this.prisma.product.findMany({
      where: { tenantId: scope.tenantId, ...(categoryId ? { categoryId } : {}) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 500, // sem take ilimitado
      select: SELECT,
    });
  }

  findById(scope: Scope, id: string) {
    return this.prisma.product.findFirst({
      where: { id, tenantId: scope.tenantId },
      select: SELECT,
    });
  }

  create(scope: Scope, data: CreateData) {
    return this.prisma.product.create({
      data: { ...data, tenantId: scope.tenantId },
      select: SELECT,
    });
  }

  async update(scope: Scope, id: string, data: Partial<CreateData>) {
    const { count } = await this.prisma.product.updateMany({
      where: { id, tenantId: scope.tenantId },
      data,
    });
    return count;
  }

  async delete(scope: Scope, id: string) {
    const { count } = await this.prisma.product.updateMany({
      where: { id, tenantId: scope.tenantId },
      data: { available: false },
    });
    return count;
  }
}
```

- [ ] **Step 6: Implementar os services**

`apps/api/src/catalog/category.service.ts`:
```ts
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CreateCategoryInput, UpdateCategoryInput } from "@consusimples/validation";
import { AppError } from "@/common/app-error";
import type { Scope } from "@/common/scope";
import { CategoryRepository } from "./category.repository";

@Injectable()
export class CategoryService {
  constructor(private readonly repo: CategoryRepository) {}

  list(scope: Scope) {
    return this.repo.list(scope);
  }

  async create(scope: Scope, input: CreateCategoryInput) {
    try {
      return await this.repo.create(scope, { name: input.name, sortOrder: input.sortOrder });
    } catch (e) {
      // P2002 = unique (tenantId, name). Erro de domínio com código próprio,
      // não a mensagem genérica do filtro.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new AppError("CATALOG_001", "Já existe uma categoria com esse nome", 409);
      }
      throw e;
    }
  }

  async update(scope: Scope, id: string, input: UpdateCategoryInput) {
    const count = await this.repo.update(scope, id, input);
    // 404, não 403: 403 confirmaria que o id existe em outro tenant.
    if (count === 0) throw new AppError("CATALOG_404", "Categoria não encontrada", 404);
    const updated = await this.repo.findById(scope, id);
    if (!updated) throw new AppError("CATALOG_404", "Categoria não encontrada", 404);
    return updated;
  }

  async deactivate(scope: Scope, id: string) {
    const count = await this.repo.deactivate(scope, id);
    if (count === 0) throw new AppError("CATALOG_404", "Categoria não encontrada", 404);
  }
}
```

`apps/api/src/catalog/product.service.ts`:
```ts
import { Injectable, Logger } from "@nestjs/common";
import type { CreateProductInput, UpdateProductInput } from "@consusimples/validation";
import { AppError } from "@/common/app-error";
import type { Scope } from "@/common/scope";
import { CategoryRepository } from "./category.repository";
import { ProductRepository } from "./product.repository";

const NOT_FOUND = new AppError("CATALOG_404", "Produto não encontrado", 404);

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    private readonly repo: ProductRepository,
    private readonly categories: CategoryRepository,
  ) {}

  list(scope: Scope, categoryId?: string) {
    return this.repo.list(scope, categoryId);
  }

  async findById(scope: Scope, id: string) {
    const product = await this.repo.findById(scope, id);
    if (!product) throw NOT_FOUND;
    return product;
  }

  async create(scope: Scope, input: CreateProductInput) {
    // Categoria de outro tenant não existe deste lado: 404, não 403.
    const category = await this.categories.findById(scope, input.categoryId);
    if (!category) throw new AppError("CATALOG_404", "Categoria não encontrada", 404);

    return this.repo.create(scope, {
      name: input.name,
      description: input.description,
      categoryId: input.categoryId,
      priceCents: input.priceCents,
      available: input.available,
      sortOrder: input.sortOrder,
    });
  }

  async update(scope: Scope, actorId: string, id: string, input: UpdateProductInput) {
    if (input.categoryId) {
      const category = await this.categories.findById(scope, input.categoryId);
      if (!category) throw new AppError("CATALOG_404", "Categoria não encontrada", 404);
    }

    const before = await this.repo.findById(scope, id);
    if (!before) throw NOT_FOUND;

    const count = await this.repo.update(scope, id, input);
    if (count === 0) throw NOT_FOUND;
    const after = await this.findById(scope, id);

    // Preço é dado de auditoria: quem mudou, de quanto para quanto.
    if (input.priceCents !== undefined && input.priceCents !== before.priceCents) {
      this.logger.log(
        {
          event: "product_price_changed",
          actorId,
          tenantId: scope.tenantId,
          productId: id,
          before: before.priceCents,
          after: after.priceCents,
        },
        "product price changed",
      );
    }
    return after;
  }

  async remove(scope: Scope, id: string) {
    const count = await this.repo.delete(scope, id);
    if (count === 0) throw NOT_FOUND;
  }
}
```

- [ ] **Step 7: Implementar os controllers e o módulo**

`apps/api/src/catalog/category.controller.ts`:
```ts
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import {
  createCategorySchema,
  updateCategorySchema,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from "@consusimples/validation";
import { CurrentUser, Roles } from "@/common/decorators";
import { ZodValidationPipe } from "@/common/zod-validation.pipe";
import type { AuthUser } from "@/auth/token.service";
import { CategoryService } from "./category.service";

@Controller("categories")
export class CategoryController {
  constructor(private readonly service: CategoryService) {}

  // Leitura: qualquer papel autenticado. O escopo do tenant vem do token, não do cliente.
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list({ tenantId: user.tenantId });
  }

  @Roles("OWNER", "MANAGER")
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCategorySchema)) dto: CreateCategoryInput,
  ) {
    return this.service.create({ tenantId: user.tenantId }, dto);
  }

  @Roles("OWNER", "MANAGER")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) dto: UpdateCategoryInput,
  ) {
    return this.service.update({ tenantId: user.tenantId }, id, dto);
  }

  @Roles("OWNER", "MANAGER")
  @HttpCode(204)
  @Delete(":id")
  async remove(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.service.deactivate({ tenantId: user.tenantId }, id);
  }
}
```

`apps/api/src/catalog/product.controller.ts`:
```ts
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import {
  createProductSchema,
  updateProductSchema,
  type CreateProductInput,
  type UpdateProductInput,
} from "@consusimples/validation";
import { CurrentUser, Roles } from "@/common/decorators";
import { ZodValidationPipe } from "@/common/zod-validation.pipe";
import type { AuthUser } from "@/auth/token.service";
import { ProductService } from "./product.service";

@Controller("products")
export class ProductController {
  constructor(private readonly service: ProductService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("categoryId") categoryId?: string) {
    return this.service.list({ tenantId: user.tenantId }, categoryId);
  }

  @Get(":id")
  findById(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.findById({ tenantId: user.tenantId }, id);
  }

  @Roles("OWNER", "MANAGER")
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createProductSchema)) dto: CreateProductInput,
  ) {
    return this.service.create({ tenantId: user.tenantId }, dto);
  }

  @Roles("OWNER", "MANAGER")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) dto: UpdateProductInput,
  ) {
    return this.service.update({ tenantId: user.tenantId }, user.sub, id, dto);
  }

  @Roles("OWNER", "MANAGER")
  @HttpCode(204)
  @Delete(":id")
  async remove(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.service.remove({ tenantId: user.tenantId }, id);
  }
}
```

`apps/api/src/catalog/catalog.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { CategoryController } from "./category.controller";
import { CategoryRepository } from "./category.repository";
import { CategoryService } from "./category.service";
import { ProductController } from "./product.controller";
import { ProductRepository } from "./product.repository";
import { ProductService } from "./product.service";

@Module({
  controllers: [CategoryController, ProductController],
  providers: [CategoryRepository, CategoryService, ProductRepository, ProductService],
})
export class CatalogModule {}
```

Adicionar `CatalogModule` aos `imports` de `apps/api/src/app.module.ts`.

- [ ] **Step 8: Rodar e ver passar**

Run: `pnpm --filter @consusimples/api test -- catalog.e2e tenant-isolation.e2e`
Expected: PASS, 7 + 6 testes.

- [ ] **Step 9: Tornar o teste de isolamento um gate explícito de CI**

Adicionar ao `.github/workflows/ci.yml`, depois do passo `pnpm turbo lint typecheck test build`:
```yaml
      # Gate dedicado: vazamento entre tenants derruba o merge, com nome visível no check.
      - name: tenant isolation gate
        run: pnpm --filter @consusimples/api test -- tenant-isolation.e2e
```

- [ ] **Step 10: Commit**

```bash
git add packages/validation apps/api/src/catalog apps/api/src/common/scope.ts apps/api/src/app.module.ts apps/api/test .github/workflows/ci.yml
git commit -m "feat(api): tenant-scoped catalog with cross-tenant isolation gate"
```

---

### Task 10: Gestão de usuários

**Files:**
- Create: `packages/validation/src/user.ts`, `apps/api/src/users/users.repository.ts`, `apps/api/src/users/users.service.ts`, `apps/api/src/users/users.controller.ts`, `apps/api/src/users/users.module.ts`
- Modify: `packages/validation/src/index.ts`, `apps/api/src/app.module.ts`
- Test: `apps/api/test/users.e2e-spec.ts`

**Interfaces:**
- Consumes: `PasswordService` (Task 4), `Scope` (Task 9), guards e decorators (Task 6)
- Produces:
  - `createUserSchema`, `updateUserSchema` em `@consusimples/validation`
  - `GET /users`, `POST /users`, `PATCH /users/:id`, `DELETE /users/:id`

- [ ] **Step 1: Escrever o teste e2e (falha primeiro)**

`apps/api/test/users.e2e-spec.ts`:
```ts
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";
import { TokenService } from "@/auth/token.service";
import { makeTenant, makeUser } from "./factories";
import { prisma, resetDb } from "./setup";

describe("users", () => {
  let app: INestApplication;
  let tokens: TokenService;
  let ownerToken: string;
  let waiterToken: string;
  let tenantId: string;
  let ownerId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    tokens = app.get(TokenService);
  });

  beforeEach(async () => {
    await resetDb();
    const tenant = await makeTenant();
    tenantId = tenant.id;
    const owner = await makeUser(tenant.id, { role: "OWNER" });
    ownerId = owner.id;
    const waiter = await makeUser(tenant.id, { role: "WAITER" });
    ownerToken = await tokens.issueAccessToken({ sub: owner.id, tenantId, role: "OWNER" });
    waiterToken = await tokens.issueAccessToken({ sub: waiter.id, tenantId, role: "WAITER" });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const auth = (t: string) => ({ authorization: `Bearer ${t}` });

  it("lists users of the tenant without leaking the password hash", async () => {
    const res = await request(app.getHttpServer()).get("/users").set(auth(ownerToken)).expect(200);
    expect(res.body).toHaveLength(2);
    for (const u of res.body) {
      expect(u.passwordHash).toBeUndefined();
      expect(u).toEqual({
        id: expect.any(String),
        name: expect.any(String),
        email: expect.any(String),
        role: expect.any(String),
        status: expect.any(String),
        lastLoginAt: null,
      });
    }
  });

  it("denies the whole users module to a waiter", async () => {
    await request(app.getHttpServer()).get("/users").set(auth(waiterToken)).expect(403);
    await request(app.getHttpServer())
      .post("/users")
      .set(auth(waiterToken))
      .send({ name: "Novo", email: "novo@bar.com", password: "senha-bem-comprida", role: "WAITER" })
      .expect(403);
  });

  it("creates a user already hashed and bound to the tenant", async () => {
    const res = await request(app.getHttpServer())
      .post("/users")
      .set(auth(ownerToken))
      .send({ name: "Garçom", email: "garcom@bar.com", password: "senha-bem-comprida", role: "WAITER" })
      .expect(201);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.tenantId).toBe(tenantId);
    expect(row.passwordHash).not.toBe("senha-bem-comprida");
    expect(row.role).toBe("WAITER");
  });

  it("rejects an email already taken anywhere in the system", async () => {
    const other = await makeTenant();
    await makeUser(other.id, { email: "repetido@bar.com" });

    const res = await request(app.getHttpServer())
      .post("/users")
      .set(auth(ownerToken))
      .send({ name: "X", email: "repetido@bar.com", password: "senha-bem-comprida", role: "WAITER" })
      .expect(409);
    expect(res.body.error.code).toBe("USER_001");
  });

  it("changes a role", async () => {
    const created = await request(app.getHttpServer())
      .post("/users")
      .set(auth(ownerToken))
      .send({ name: "Garçom", email: "garcom@bar.com", password: "senha-bem-comprida", role: "WAITER" })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/users/${created.body.id}`)
      .set(auth(ownerToken))
      .send({ role: "CASHIER" })
      .expect(200);

    expect(updated.body.role).toBe("CASHIER");
  });

  it("refuses to disable the last owner", async () => {
    const res = await request(app.getHttpServer())
      .delete(`/users/${ownerId}`)
      .set(auth(ownerToken))
      .expect(409);
    expect(res.body.error.code).toBe("USER_002");

    const row = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
    expect(row.status).toBe("ACTIVE"); // continua podendo entrar
  });

  it("returns 404 for a user of another tenant", async () => {
    const other = await makeTenant();
    const stranger = await makeUser(other.id);
    await request(app.getHttpServer())
      .patch(`/users/${stranger.id}`)
      .set(auth(ownerToken))
      .send({ role: "WAITER" })
      .expect(404);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @consusimples/api test -- users.e2e`
Expected: FAIL — rotas `/users` respondem 404.

- [ ] **Step 3: Escrever os schemas**

`packages/validation/src/user.ts`:
```ts
import { z } from "zod";

export const userRoleSchema = z.enum(["OWNER", "MANAGER", "WAITER", "KITCHEN", "CASHIER"]);

export const createUserSchema = z
  .object({
    name: z.string().min(2).max(120).trim(),
    email: z.string().email().max(254).toLowerCase().trim(),
    password: z.string().min(12).max(1024),
    role: userRoleSchema,
  })
  .strict();
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({ name: z.string().min(2).max(120).trim(), role: userRoleSchema })
  .partial()
  .strict();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
```

Atualizar `packages/validation/src/index.ts`:
```ts
export * from "./auth";
export * from "./catalog";
export * from "./user";
```

- [ ] **Step 4: Implementar repository, service e controller**

`apps/api/src/users/users.repository.ts`:
```ts
import { Injectable } from "@nestjs/common";
import type { UserRole } from "@prisma/client";
import type { Scope } from "@/common/scope";
import { PrismaService } from "@/prisma/prisma.service";

// select explícito: passwordHash nunca entra na resposta.
const SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  lastLoginAt: true,
} as const;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(scope: Scope) {
    return this.prisma.user.findMany({
      where: { tenantId: scope.tenantId },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: SELECT,
    });
  }

  findById(scope: Scope, id: string) {
    return this.prisma.user.findFirst({ where: { id, tenantId: scope.tenantId }, select: SELECT });
  }

  create(scope: Scope, data: { name: string; email: string; passwordHash: string; role: UserRole }) {
    return this.prisma.user.create({ data: { ...data, tenantId: scope.tenantId }, select: SELECT });
  }

  async update(scope: Scope, id: string, data: { name?: string; role?: UserRole }) {
    const { count } = await this.prisma.user.updateMany({
      where: { id, tenantId: scope.tenantId },
      data,
    });
    return count;
  }

  async disable(scope: Scope, id: string) {
    const { count } = await this.prisma.user.updateMany({
      where: { id, tenantId: scope.tenantId, status: "ACTIVE" },
      data: { status: "DISABLED" },
    });
    return count;
  }

  countActiveOwners(scope: Scope) {
    return this.prisma.user.count({
      where: { tenantId: scope.tenantId, role: "OWNER", status: "ACTIVE" },
    });
  }

  // Unicidade de email é global no sistema, então esta checagem não leva Scope.
  findByEmailUnscoped(email: string) {
    return this.prisma.user.findUnique({ where: { email }, select: { id: true } });
  }
}
```

`apps/api/src/users/users.service.ts`:
```ts
import { Injectable, Logger } from "@nestjs/common";
import type { CreateUserInput, UpdateUserInput } from "@consusimples/validation";
import { PasswordService } from "@/auth/password.service";
import { TokenService } from "@/auth/token.service";
import { AppError } from "@/common/app-error";
import type { Scope } from "@/common/scope";
import { UsersRepository } from "./users.repository";

const NOT_FOUND = new AppError("USER_404", "Usuário não encontrado", 404);

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly repo: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  list(scope: Scope) {
    return this.repo.list(scope);
  }

  async create(scope: Scope, actorId: string, input: CreateUserInput) {
    const taken = await this.repo.findByEmailUnscoped(input.email);
    if (taken) throw new AppError("USER_001", "Email já cadastrado", 409);

    const user = await this.repo.create(scope, {
      name: input.name,
      email: input.email,
      passwordHash: await this.passwords.hash(input.password),
      role: input.role,
    });

    this.logger.log(
      { event: "user_created", actorId, tenantId: scope.tenantId, userId: user.id, role: user.role },
      "user created",
    );
    return user;
  }

  async update(scope: Scope, actorId: string, id: string, input: UpdateUserInput) {
    const before = await this.repo.findById(scope, id);
    if (!before) throw NOT_FOUND;

    // Rebaixar o último OWNER deixaria o tenant sem quem administra.
    if (before.role === "OWNER" && input.role && input.role !== "OWNER") {
      const owners = await this.repo.countActiveOwners(scope);
      if (owners <= 1) throw new AppError("USER_002", "O restaurante precisa de um dono ativo", 409);
    }

    const count = await this.repo.update(scope, id, input);
    if (count === 0) throw NOT_FOUND;

    const after = await this.repo.findById(scope, id);
    if (!after) throw NOT_FOUND;

    this.logger.log(
      {
        event: "user_updated",
        actorId,
        tenantId: scope.tenantId,
        userId: id,
        before: { name: before.name, role: before.role },
        after: { name: after.name, role: after.role },
      },
      "user updated",
    );
    return after;
  }

  async disable(scope: Scope, actorId: string, id: string) {
    const user = await this.repo.findById(scope, id);
    if (!user) throw NOT_FOUND;

    if (user.role === "OWNER") {
      const owners = await this.repo.countActiveOwners(scope);
      if (owners <= 1) throw new AppError("USER_002", "O restaurante precisa de um dono ativo", 409);
    }

    const count = await this.repo.disable(scope, id);
    if (count === 0) throw NOT_FOUND;

    // Usuário desativado não pode continuar com sessão aberta.
    await this.tokens.revokeFamilyByUser(id);
    this.logger.log(
      { event: "user_disabled", actorId, tenantId: scope.tenantId, userId: id },
      "user disabled",
    );
  }
}
```

`apps/api/src/users/users.controller.ts`:
```ts
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import {
  createUserSchema,
  updateUserSchema,
  type CreateUserInput,
  type UpdateUserInput,
} from "@consusimples/validation";
import { CurrentUser, Roles } from "@/common/decorators";
import { ZodValidationPipe } from "@/common/zod-validation.pipe";
import type { AuthUser } from "@/auth/token.service";
import { UsersService } from "./users.service";

// O módulo inteiro é de administração: nenhum papel operacional entra.
@Roles("OWNER", "MANAGER")
@Controller("users")
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list({ tenantId: user.tenantId });
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserInput,
  ) {
    return this.service.create({ tenantId: user.tenantId }, user.sub, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) dto: UpdateUserInput,
  ) {
    return this.service.update({ tenantId: user.tenantId }, user.sub, id, dto);
  }

  @HttpCode(204)
  @Delete(":id")
  async disable(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.service.disable({ tenantId: user.tenantId }, user.sub, id);
  }
}
```

`apps/api/src/users/users.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersRepository } from "./users.repository";
import { UsersService } from "./users.service";

@Module({
  controllers: [UsersController],
  providers: [UsersRepository, UsersService],
})
export class UsersModule {}
```

Adicionar `UsersModule` aos `imports` de `apps/api/src/app.module.ts`.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @consusimples/api test -- users.e2e`
Expected: PASS, 7 testes.

- [ ] **Step 6: Rodar a suíte inteira e o CI local**

Run: `pnpm turbo lint typecheck test build`
Expected: todos os pacotes verdes, zero warning de lint.

- [ ] **Step 7: Commit**

```bash
git add packages/validation apps/api/src/users apps/api/src/app.module.ts apps/api/test/users.e2e-spec.ts
git commit -m "feat(api): tenant-scoped user management with last-owner protection"
```

---

### Task 11: Recuperação de senha

**Files:**
- Modify: `apps/api/prisma/schema.prisma`, `packages/validation/src/auth.ts`, `apps/api/src/mail/mailer.port.ts`, `apps/api/src/mail/resend.mailer.ts`, `apps/api/src/auth/auth.repository.ts`, `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.controller.ts`
- Test: `apps/api/test/password-reset.e2e-spec.ts`

**Interfaces:**
- Consumes: `PasswordService` (Task 4), `TokenService.revokeFamilyByUser` (Task 5), `Mailer` (Task 7)
- Produces:
  - Model `PasswordResetToken`
  - `Mailer.sendPasswordReset(to: string, link: string): Promise<void>`
  - `forgotPasswordSchema`, `resetPasswordSchema` em `@consusimples/validation`
  - `POST /auth/forgot-password` → **sempre** 202, independente do email existir
  - `POST /auth/reset-password` → 200 `{ ok: true }`

- [ ] **Step 1: Escrever o teste e2e (falha primeiro)**

`apps/api/test/password-reset.e2e-spec.ts`:
```ts
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "@/app.module";
import { PasswordService } from "@/auth/password.service";
import { MAILER, type Mailer } from "@/mail/mailer.port";
import { makeTenant, makeUser } from "./factories";
import { prisma, resetDb } from "./setup";

class FakeMailer implements Mailer {
  sent: { kind: "verify" | "reset"; to: string; link: string }[] = [];
  async sendEmailVerification(to: string, link: string) {
    this.sent.push({ kind: "verify", to, link });
  }
  async sendPasswordReset(to: string, link: string) {
    this.sent.push({ kind: "reset", to, link });
  }
}

const OLD = "senha-antiga-longa";
const NEW = "senha-nova-bem-longa";

describe("password reset", () => {
  let app: INestApplication;
  let passwords: PasswordService;
  const mailer = new FakeMailer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAILER)
      .useValue(mailer)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    passwords = app.get(PasswordService);
  });

  beforeEach(async () => {
    await resetDb();
    mailer.sent = [];
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const seedUser = async () => {
    const tenant = await makeTenant({ status: "ACTIVE" });
    return makeUser(tenant.id, {
      email: "ze@bar.com",
      passwordHash: await passwords.hash(OLD),
    });
  };

  const linkToken = () => new URL(mailer.sent.at(-1)!.link).searchParams.get("token")!;

  it("answers 202 and sends a link for a known email", async () => {
    await seedUser();
    await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email: "ze@bar.com" })
      .expect(202);

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.kind).toBe("reset");
    expect(mailer.sent[0]!.link).toContain("/redefinir-senha?token=");
  });

  it("answers 202 for an unknown email and sends nothing", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email: "ninguem@bar.com" })
      .expect(202);

    // Corpo idêntico ao caso conhecido: a resposta não pode revelar que a conta existe.
    expect(res.body).toEqual({ ok: true });
    expect(mailer.sent).toHaveLength(0);
  });

  it("resets the password and lets the user log in with the new one", async () => {
    await seedUser();
    await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email: "ze@bar.com" })
      .expect(202);

    await request(app.getHttpServer())
      .post("/auth/reset-password")
      .send({ token: linkToken(), password: NEW })
      .expect(200, { ok: true });

    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ze@bar.com", password: NEW })
      .expect(200);

    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ze@bar.com", password: OLD })
      .expect(401);
  });

  it("revokes every open session when the password changes", async () => {
    const user = await seedUser();
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ze@bar.com", password: OLD })
      .expect(200);

    await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email: "ze@bar.com" })
      .expect(202);
    await request(app.getHttpServer())
      .post("/auth/reset-password")
      .send({ token: linkToken(), password: NEW })
      .expect(200);

    // A sessão aberta antes da troca não sobrevive.
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);

    const tokens = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(tokens.every((t) => t.revokedAt !== null)).toBe(true);
  });

  it("refuses to reuse a reset token", async () => {
    await seedUser();
    await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email: "ze@bar.com" })
      .expect(202);
    const token = linkToken();

    await request(app.getHttpServer())
      .post("/auth/reset-password")
      .send({ token, password: NEW })
      .expect(200);
    await request(app.getHttpServer())
      .post("/auth/reset-password")
      .send({ token, password: "outra-senha-longa" })
      .expect(400);
  });

  it("refuses an expired reset token", async () => {
    await seedUser();
    await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email: "ze@bar.com" })
      .expect(202);
    await prisma.passwordResetToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await request(app.getHttpServer())
      .post("/auth/reset-password")
      .send({ token: linkToken(), password: NEW })
      .expect(400);
  });

  it("rejects a new password shorter than 12 characters", async () => {
    await seedUser();
    await request(app.getHttpServer())
      .post("/auth/forgot-password")
      .send({ email: "ze@bar.com" })
      .expect(202);

    await request(app.getHttpServer())
      .post("/auth/reset-password")
      .send({ token: linkToken(), password: "curta" })
      .expect(422);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @consusimples/api test -- password-reset.e2e`
Expected: FAIL — `/auth/forgot-password` responde 404.

- [ ] **Step 3: Adicionar a tabela**

Em `apps/api/prisma/schema.prisma`, acrescentar o model e a relação em `User`:
```prisma
model PasswordResetToken {
  id        String    @id @default(uuid(7)) @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  tokenHash String    @unique @map("token_hash")
  expiresAt DateTime  @map("expires_at") @db.Timestamptz(3)
  usedAt    DateTime? @map("used_at") @db.Timestamptz(3)
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("password_reset_tokens")
}
```

Em `model User`, adicionar à lista de relações: `passwordResetTokens PasswordResetToken[]`.

Run: `pnpm --filter @consusimples/api exec prisma migrate dev --name add_password_reset_token`
Expected: migration aditiva, nenhum `DROP` no SQL gerado.

- [ ] **Step 4: Estender os schemas e o mailer**

Acrescentar a `packages/validation/src/auth.ts`:
```ts
export const forgotPasswordSchema = z.object({ email }).strict();
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({ token: z.string().min(10).max(200), password })
  .strict();
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
```

Acrescentar a `apps/api/src/mail/mailer.port.ts`:
```ts
  sendPasswordReset(to: string, link: string): Promise<void>;
```
(dentro de `interface Mailer`)

Acrescentar a `apps/api/src/mail/resend.mailer.ts`:
```ts
  async sendPasswordReset(to: string, link: string): Promise<void> {
    const { error } = await this.client.emails.send({
      from: env.MAIL_FROM,
      to,
      subject: "Redefinir senha — consusimples",
      html: `<p>Alguém pediu para redefinir a senha desta conta.</p>
             <p><a href="${link}">Criar uma nova senha</a></p>
             <p>O link vale por 1 hora. Se não foi você, ignore este email.</p>`,
    });
    if (error) {
      this.logger.error({ to: to.replace(/(.).*(@.*)/, "$1***$2") }, "password reset email failed");
      throw error;
    }
  }
```

- [ ] **Step 5: Implementar no repository e no service**

Acrescentar a `apps/api/src/auth/auth.repository.ts`:
```ts
  createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date) {
    return this.prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } });
  }

  async consumePasswordResetToken(rawToken: string, newPasswordHash: string) {
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
      if (!row || row.usedAt || row.expiresAt <= new Date()) return null;

      // updateMany com usedAt: null — dois envios simultâneos, só um consome.
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count === 0) return null;

      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash: newPasswordHash },
      });
      // Qualquer outro link de reset pendente morre junto.
      await tx.passwordResetToken.updateMany({
        where: { userId: row.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      return row.userId;
    });
  }
```

Acrescentar a `apps/api/src/auth/auth.service.ts`:
```ts
  private static readonly RESET_TTL_MS = 60 * 60 * 1000;

  async forgotPassword(email: string): Promise<{ ok: true }> {
    const user = await this.repo.findUserByEmailUnscoped(email);

    // Resposta idêntica exista ou não a conta: qualquer diferença — corpo, status
    // ou tempo perceptível — vira oráculo de enumeração de email.
    if (user && user.status === "ACTIVE") {
      const rawToken = randomBytes(32).toString("base64url");
      await this.repo.createPasswordResetToken(
        user.id,
        createHash("sha256").update(rawToken).digest("hex"),
        new Date(Date.now() + AuthService.RESET_TTL_MS),
      );
      await this.mailer.sendPasswordReset(
        user.email,
        `${env.WEB_BASE_URL}/redefinir-senha?token=${rawToken}`,
      );
      this.logger.log(
        { event: "password_reset_requested", userId: user.id, tenantId: user.tenantId },
        "password reset requested",
      );
    } else {
      this.logger.warn(
        { event: "password_reset_unknown_email", email: maskEmail(email) },
        "password reset for unknown email",
      );
    }

    return { ok: true };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ ok: true }> {
    const passwordHash = await this.passwords.hash(newPassword);
    const userId = await this.repo.consumePasswordResetToken(token, passwordHash);
    if (!userId) throw new AppError("AUTH_005", "Link inválido ou expirado", 400);

    // Troca de senha derruba toda sessão aberta: é a única forma de expulsar
    // quem já estava dentro com a senha antiga.
    await this.tokens.revokeFamilyByUser(userId);
    this.logger.log({ event: "password_reset", userId }, "password reset");
    return { ok: true };
  }
```

- [ ] **Step 6: Expor as rotas**

Acrescentar a `apps/api/src/auth/auth.controller.ts`:
```ts
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from "@consusimples/validation";

  @Public()
  @Throttle({ default: { ttl: 3_600_000, limit: 3 } })
  @HttpCode(202)
  @Post("forgot-password")
  forgotPassword(@Body(new ZodValidationPipe(forgotPasswordSchema)) dto: ForgotPasswordInput) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  @HttpCode(200)
  @Post("reset-password")
  resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordInput) {
    return this.auth.resetPassword(dto.token, dto.password);
  }
```

- [ ] **Step 7: Rodar e ver passar**

Run: `pnpm --filter @consusimples/api test -- password-reset.e2e`
Expected: PASS, 7 testes.

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma packages/validation/src/auth.ts apps/api/src/mail apps/api/src/auth apps/api/test/password-reset.e2e-spec.ts
git commit -m "feat(api): password reset with single-use tokens and session revocation"
```

---

### Task 12: Empacotamento e deploy na VPS

**Files:**
- Create: `apps/api/Dockerfile`, `apps/api/.dockerignore`, `docker-compose.prod.yml`, `scripts/backup-db.sh`, `docs/runbook-deploy.md`

**Interfaces:**
- Consumes: a API completa (Tasks 1–10)
- Produces: imagem `consusimples-api` que sobe como usuário non-root, com `/health/ready` como healthcheck e `APP_VERSION` igual ao commit SHA

- [ ] **Step 1: Escrever o Dockerfile multi-stage**

`apps/api/Dockerfile` (contexto de build é a raiz do monorepo):
```dockerfile
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/validation/package.json packages/validation/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/validation/node_modules ./packages/validation/node_modules
COPY . .
RUN pnpm --filter @consusimples/validation build \
 && pnpm --filter @consusimples/api exec prisma generate \
 && pnpm --filter @consusimples/api build \
 && pnpm prune --prod

FROM base AS runtime
ENV NODE_ENV=production
# Identidade do que roda é o commit. O código só conhece APP_VERSION, nunca GIT_SHA.
ARG GIT_SHA=dev
ENV APP_VERSION=$GIT_SHA
# Heap abaixo do limite de memória do compose: o container morre por OOM antes do Node coletar.
ENV NODE_OPTIONS=--max-old-space-size=384

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/packages/validation/dist ./packages/validation/dist

# node:alpine já traz o usuário `node` (uid 1000). Nunca rodar como root.
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]
```

`apps/api/.dockerignore`:
```
node_modules
dist
.turbo
.env
*.log
```

- [ ] **Step 2: Escrever o compose de produção**

`docker-compose.prod.yml` — **nenhum segredo aqui**; tudo vem de `.env` no servidor, fora do git:
```yaml
services:
  migrate:
    image: consusimples-api:${GIT_SHA}
    # Migration é passo separado, nunca no entrypoint da app: duas réplicas subindo
    # ao mesmo tempo migrariam em paralelo.
    command: ["node_modules/.bin/prisma", "migrate", "deploy", "--schema", "apps/api/prisma/schema.prisma"]
    env_file: [.env]
    depends_on:
      postgres: { condition: service_healthy }
    restart: "no"

  api:
    image: consusimples-api:${GIT_SHA}
    env_file: [.env]
    depends_on:
      migrate: { condition: service_completed_successfully }
      postgres: { condition: service_healthy }
    ports: ["127.0.0.1:3001:3001"]  # só o proxy da VPS alcança; nada exposto na internet
    restart: unless-stopped
    deploy:
      resources:
        limits: { memory: 512M }
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "5" }  # rotação: log sem teto enche o disco da VPS

  postgres:
    image: postgres:17-alpine
    env_file: [.env]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER"]
      interval: 10s
      timeout: 5s
      retries: 10
    restart: unless-stopped
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "5" }

volumes:
  pgdata:
```

- [ ] **Step 3: Escrever o backup off-site**

`scripts/backup-db.sh` — backup que mora no mesmo disco não é backup:
```bash
#!/usr/bin/env bash
set -euo pipefail

# Variáveis vêm do ambiente do servidor: PGHOST, PGUSER, PGPASSWORD, PGDATABASE,
# BACKUP_PASSPHRASE e BACKUP_REMOTE (destino rclone/rsync fora da VPS).
: "${BACKUP_PASSPHRASE:?}" "${BACKUP_REMOTE:?}" "${PGDATABASE:?}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="/tmp/consusimples-${STAMP}.sql.gz.gpg"

pg_dump --format=plain --no-owner \
  | gzip -9 \
  | gpg --batch --symmetric --cipher-algo AES256 --passphrase "$BACKUP_PASSPHRASE" -o "$FILE"

rclone copy "$FILE" "$BACKUP_REMOTE"
rm -f "$FILE"

echo "backup ${STAMP} enviado para ${BACKUP_REMOTE}"
```

Run: `chmod +x scripts/backup-db.sh`

- [ ] **Step 4: Escrever o runbook**

`docs/runbook-deploy.md`:
```markdown
# Runbook — deploy da API na VPS do cliente

Ambiente: VPS do cliente, fora do Proxmox. Um proxy (Caddy/Traefik) na frente termina o TLS.

## Primeiro deploy

1. `cp .env.example .env` no servidor e preencher **todos** os valores. Segredos com 32+ caracteres
   gerados por `openssl rand -base64 48`.
2. Medir os proxies antes de fixar `TRUST_PROXY_HOPS` (ver "Conferir o trust proxy" abaixo).
3. `export GIT_SHA=$(git rev-parse --short HEAD)`
4. `docker build -f apps/api/Dockerfile --build-arg GIT_SHA=$GIT_SHA -t consusimples-api:$GIT_SHA .`
5. `docker compose -f docker-compose.prod.yml up -d`
6. `curl -s localhost:3001/health/ready` deve responder `{"status":"ok"}`.
7. Agendar o backup: `0 3 * * * /opt/consusimples/scripts/backup-db.sh` no cron do servidor.
8. **Testar o restore** do primeiro backup num banco descartável. Backup nunca restaurado não conta.

## Conferir o trust proxy

Subir temporariamente uma rota `GET /debug/whoami` que devolve `req.ip` e o `x-forwarded-for` cru, e
chamar de fora: `curl -H 'X-Forwarded-For: 1.2.3.4' https://api.dominio/debug/whoami`.
O `ip` retornado deve ser o IP real do cliente, nunca `1.2.3.4`. Ajustar `TRUST_PROXY_HOPS`
até bater e **remover a rota** em seguida.

## Deploy seguinte

Mesmos passos 3–6. A imagem antiga fica no disco: é o rollback.

## Rollback

`GIT_SHA=<sha-anterior> docker compose -f docker-compose.prod.yml up -d api`

Migration **não** volta sozinha. Se o deploy incluiu migration destrutiva, o rollback exige restore
do backup — por isso migration destrutiva só entra por expand/contract, em deploys separados.

## O que nunca fazer sozinho neste servidor

Parar o banco, apagar volume, rodar `prisma migrate reset`, editar `.env` sem avisar, ou aplicar
migration destrutiva. Tudo isso pede confirmação explícita do responsável.
```

- [ ] **Step 5: Verificar a imagem localmente**

Run:
```bash
export GIT_SHA=$(git rev-parse --short HEAD)
docker build -f apps/api/Dockerfile --build-arg GIT_SHA=$GIT_SHA -t consusimples-api:$GIT_SHA .
docker run --rm consusimples-api:$GIT_SHA node -e "console.log(process.env.APP_VERSION)"
docker run --rm consusimples-api:$GIT_SHA id -u
```
Expected: primeira saída = o SHA curto do commit; segunda = `1000` (usuário `node`, não root).

- [ ] **Step 6: Commit**

```bash
git add apps/api/Dockerfile apps/api/.dockerignore docker-compose.prod.yml scripts/backup-db.sh docs/runbook-deploy.md
git commit -m "chore(api): package api as non-root image with migration job, backup and rollback runbook"
```

---

## Checklist de segurança do módulo (§13 do baseline)

Rodar antes de declarar a API pronta. Item que não se aplica é riscado com o motivo.

```text
Entrada
[ ] Todo input validado por schema zod de packages/validation (Tasks 7, 9, 10)
[ ] Limite de body (1 MB), take limitado em toda listagem (500 produtos, 200 usuários)
[ ] Sem SQL cru concatenado — único raw é `SELECT 1` do readiness
Identidade e acesso
[ ] Rota autenticada por padrão; exceção explícita com @Public (Task 6)
[ ] @Roles com papel específico em toda escrita de catálogo e no módulo de usuários
[ ] Query filtra tenantId no WHERE, nunca em `if` pós-consulta (Task 9)
[ ] 404, não 403, para recurso de outro tenant (Task 9)
[ ] Testado com usuário de OUTRO tenant e com papel sem permissão
Abuso
[ ] Rate limit próprio em login (5/15min), refresh (20/15min), forgot-password (3/h) e reset (10/h)
[ ] forgot-password responde 202 idêntico para email conhecido e desconhecido
[-] Idempotency-Key — nenhuma escrita deste módulo é repetível com efeito colateral externo
Dados
[ ] select explícito em todo repository; passwordHash nunca sai
[ ] Email e senha têm base legal (execução de contrato) e entram no fluxo de exclusão do módulo futuro
[ ] Log sem PII crua (email mascarado), sem token, sem hash; audit log em login, criação e mudança de papel
Arquivo e rede
[-] Upload e URL de usuário — não existem neste módulo
Segredos e config
[ ] Toda variável nova está no EnvSchema e no .env.example
[ ] Nenhum segredo em log, bundle ou repositório; gitleaks no CI
Verificação
[ ] Teste do caminho negado (401/403/404), não só do caminho feliz
[ ] Revisão manual: "o que acontece se chamarem isso direto por curl?"
```

## Definition of Done

- `pnpm turbo lint typecheck test build` verde.
- `pnpm --filter @consusimples/api exec prisma migrate status` limpo.
- Gate de isolamento entre tenants passando no CI com nome próprio no check.
- `.env.example` com todas as chaves e nenhum valor real.
- Nenhum `findUnique` por id em entidade com dono fora dos métodos marcados `Unscoped`.
- Imagem sobe como usuário non-root, com healthcheck e `APP_VERSION` = commit SHA.
- Backup agendado **e restaurado uma vez** num banco descartável antes de considerar o deploy pronto.
