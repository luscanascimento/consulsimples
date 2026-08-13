# Módulo 1 — Base (Web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar as telas do módulo 1 do consusimples — signup, verificação de email, login, onboarding, catálogo e usuários — com o access token vivendo só no servidor do Next.

**Architecture:** BFF. O browser fala **apenas** com o Next; o access token e o refresh token vivem em cookies `HttpOnly` lidos no servidor, que chama a API interna com `Authorization: Bearer`. Server Components leem dados, Server Actions fazem mutação. Nenhum componente de client conhece a API nem o token.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS 4, zod (via `@consusimples/validation`), Playwright.

**Pré-requisito:** o plano `2026-08-13-modulo-1-base-api.md` executado — a API precisa responder em `API_INTERNAL_URL`.

## Global Constraints

- **Idioma:** UI, rotas e textos em pt-BR. Código, nomes de função e commits em inglês.
- **Token nunca no browser.** Todo módulo que lê cookie ou fala com a API começa com `import "server-only"`. Se um Client Component importar, o build quebra — essa é a garantia mecânica.
- **Toda Server Action é endpoint HTTP público:** valida sessão, valida payload com o schema de `@consusimples/validation` e trata erro dentro dela. O botão sumir da tela não protege nada.
- **Validação:** o mesmo schema zod da API. Nunca declarar a forma do payload à mão no front.
- **`fetch` sempre declara a intenção de cache.** Dado de usuário/tenant é `cache: "no-store"`, sem exceção — cache compartilhado vaza dado entre tenants.
- **Cinco estados obrigatórios** em toda tela que busca dado: carregando, vazio, erro, sucesso, sem permissão. Estado vazio traz ação, não frase morta.
- **Telas-alvo:** 1280×720 e 1366×768 (largura **e** altura) para as telas autenticadas; 360×740 também para login e recuperação de senha.
- **Acessibilidade:** foco visível, formulário navegável por teclado, erro de campo ligado ao input por `aria-describedby`, contraste AA. Não é acabamento, é requisito.
- **Dinheiro:** o contrato da API é `priceCents` inteiro. A conversão para "R$ 23,50" acontece só na borda de apresentação, com `Intl.NumberFormat`.
- **Nenhum segredo em `NEXT_PUBLIC_*`** — é inlinado no bundle em build time.

---

## File Structure

```
apps/web/
  package.json  tsconfig.json  next.config.ts  tailwind.config.ts  playwright.config.ts
  src/
    env.ts                        schema zod server + client
    middleware.ts                 CSP com nonce por request
    lib/
      api.ts                      server-only: apiFetch com Bearer do cookie
      session.ts                  server-only: get/set/clear dos cookies de sessão
      auth.ts                     server-only: requireSession, redireciona sem sessão
      errors.ts                   ApiError → mensagem em pt-BR
      money.ts                    formatCents / parseCurrencyInput
    components/
      field.tsx                   label + input + erro com aria-describedby
      button.tsx                  variantes e estado pendente
      empty-state.tsx             vazio com ação
      error-state.tsx             erro com retry
      data-table.tsx              tabela com header sticky
      modal.tsx                   dialog acessível, foco preso
    app/
      layout.tsx  globals.css
      (public)/
        layout.tsx                centralizado, responsivo a partir de 360px
        entrar/page.tsx  entrar/actions.ts
        cadastrar/page.tsx  cadastrar/actions.ts
        confirme-seu-email/page.tsx
        verificar-email/page.tsx
        esqueci-senha/page.tsx  esqueci-senha/actions.ts  esqueci-senha/forgot-form.tsx
        redefinir-senha/page.tsx  redefinir-senha/actions.ts  redefinir-senha/reset-form.tsx
      (app)/
        layout.tsx                shell autenticado: nav lateral + guarda de sessão
        page.tsx                  redireciona para /cardapio
        onboarding/page.tsx  onboarding/actions.ts
        cardapio/page.tsx  cardapio/actions.ts  cardapio/category-list.tsx  cardapio/product-table.tsx  cardapio/product-form-modal.tsx
        usuarios/page.tsx  usuarios/actions.ts  usuarios/user-form-modal.tsx
  e2e/
    global-setup.ts  signup.spec.ts  auth.spec.ts  password-reset.spec.ts
    catalog.spec.ts  users.spec.ts
```

**Por que assim:** cada rota guarda sua `page.tsx`, seus componentes de client e suas `actions.ts` no mesmo diretório — o que muda junto mora junto. `lib/` guarda só o que atravessa rotas, e tudo ali é `server-only`.

---

### Task 1: Fundação do app web e o cofre da sessão

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/tailwind.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/src/env.ts`, `apps/web/src/middleware.ts`, `apps/web/src/lib/session.ts`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/errors.ts`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.css`
- Modify: `.env.example`
- Test: `apps/web/src/lib/errors.spec.ts`

**Interfaces:**
- Consumes: API do plano anterior em `env.API_INTERNAL_URL`
- Produces:
  - `getSession(): Promise<Session | null>` onde `Session = { accessToken: string; refreshToken: string }`
  - `setSession(tokens: { accessToken: string; refreshToken: string }): Promise<void>`
  - `clearSession(): Promise<void>`
  - `apiFetch<T>(path: string, init?: RequestInit): Promise<T>` — lança `ApiError`
  - `class ApiError extends Error { code: string; status: number; details?: unknown }`
  - `messageFor(error: unknown): string` — mensagem em pt-BR para exibir ao usuário

- [ ] **Step 1: Criar o app**

`apps/web/package.json`:
```json
{
  "name": "@consusimples/web",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "lint": "eslint src e2e --max-warnings 0",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@consusimples/validation": "workspace:*",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "server-only": "^0.0.1",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/jest": "^29.5.14",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.17.0",
    "eslint-config-next": "^15.1.0",
    "jest": "^29.7.0",
    "postcss": "^8.4.49",
    "tailwindcss": "^4.0.0",
    "ts-jest": "^29.2.5",
    "typescript": "^5.7.0"
  }
}
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "lib": ["DOM", "DOM.Iterable", "ES2023"],
    "noEmit": true,
    "allowJs": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "src/**/*", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/web/next.config.ts`:
```ts
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // O bundle não deve conter nada do monorepo além do que o Next transpila.
  transpilePackages: ["@consusimples/validation"],
  poweredByHeader: false,
};

export default config;
```

Acrescentar ao `.env.example` da raiz:
```bash
# apps/web
API_INTERNAL_URL=http://localhost:3001
NEXT_PUBLIC_APP_ENV=dev
```

- [ ] **Step 2: Escrever o schema de env do Next**

`apps/web/src/env.ts`:
```ts
import { z } from "zod";

// Segredo só do lado servidor. NEXT_PUBLIC_* é inlinado no bundle em build time:
// é tão público quanto o HTML.
const server = z.object({ API_INTERNAL_URL: z.string().url() });
const client = z.object({ NEXT_PUBLIC_APP_ENV: z.enum(["dev", "staging", "prod"]) });

// Objeto literal obrigatório, uma chave por linha: o bundler substitui
// `process.env.NEXT_PUBLIC_X` literalmente — acesso dinâmico vira undefined.
const clientRaw = { NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV };

const isServer = typeof window === "undefined";
const parsed = isServer
  ? server.merge(client).safeParse({ ...process.env, ...clientRaw })
  : client.safeParse(clientRaw);

if (!parsed.success) {
  throw new Error(`[env] ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
}

export const env = parsed.data as z.infer<typeof server> & z.infer<typeof client>;
```

- [ ] **Step 3: Escrever o teste do tradutor de erro (falha primeiro)**

`apps/web/src/lib/errors.spec.ts`:
```ts
import { ApiError, messageFor } from "./errors";

describe("messageFor", () => {
  it("translates known API codes to pt-BR", () => {
    expect(messageFor(new ApiError("AUTH_001", 401))).toBe("Email ou senha inválidos.");
    expect(messageFor(new ApiError("AUTH_004", 409))).toBe(
      "Não foi possível concluir o cadastro. Tente outro email.",
    );
    expect(messageFor(new ApiError("AUTH_006", 403))).toBe(
      "Confirme seu email antes de entrar. Verifique sua caixa de entrada.",
    );
    expect(messageFor(new ApiError("VALIDATION_001", 422))).toBe(
      "Confira os campos destacados.",
    );
    expect(messageFor(new ApiError("CATALOG_001", 409))).toBe(
      "Já existe uma categoria com esse nome.",
    );
    expect(messageFor(new ApiError("USER_002", 409))).toBe(
      "O restaurante precisa de pelo menos um dono ativo.",
    );
  });

  it("maps 429 to a rate limit message regardless of code", () => {
    expect(messageFor(new ApiError("COMMON_429", 429))).toBe(
      "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
    );
  });

  it("falls back to a generic message for an unknown error", () => {
    expect(messageFor(new Error("boom"))).toBe(
      "Algo deu errado. Tente de novo em instantes.",
    );
  });

  it("never leaks the raw error message to the user", () => {
    expect(messageFor(new ApiError("WEIRD_999", 500))).not.toContain("WEIRD_999");
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm --filter @consusimples/web test -- errors`
Expected: FAIL — `Cannot find module './errors'`.

- [ ] **Step 5: Implementar o tradutor de erro**

`apps/web/src/lib/errors.ts`:
```ts
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

const MESSAGES: Record<string, string> = {
  AUTH_001: "Email ou senha inválidos.",
  AUTH_003: "Sua sessão expirou. Entre de novo.",
  AUTH_004: "Não foi possível concluir o cadastro. Tente outro email.",
  AUTH_005: "Link inválido ou expirado. Peça um novo.",
  AUTH_006: "Confirme seu email antes de entrar. Verifique sua caixa de entrada.",
  AUTH_403: "Você não tem permissão para isso.",
  VALIDATION_001: "Confira os campos destacados.",
  CATALOG_001: "Já existe uma categoria com esse nome.",
  CATALOG_404: "Esse item não existe mais.",
  USER_001: "Esse email já está cadastrado.",
  USER_002: "O restaurante precisa de pelo menos um dono ativo.",
  USER_404: "Esse usuário não existe mais.",
};

const GENERIC = "Algo deu errado. Tente de novo em instantes.";

export function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) return GENERIC;
  // 429 tem tratamento próprio: a causa é o ritmo, não o payload.
  if (error.status === 429) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  // Fallback nunca ecoa o código cru: o usuário não deve ler jargão nosso.
  return MESSAGES[error.code] ?? GENERIC;
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @consusimples/web test -- errors`
Expected: PASS, 4 testes.

- [ ] **Step 7: Implementar sessão e cliente de API**

`apps/web/src/lib/session.ts`:
```ts
import "server-only";
import { cookies } from "next/headers";

// __Host- amarra o cookie ao host exato: exige Secure e path=/, e proíbe Domain.
// Subdomínio comprometido não consegue sobrescrever.
const ACCESS = "__Host-at";
const REFRESH = "__Host-rt";

export type Session = { accessToken: string; refreshToken: string };

const base = {
  httpOnly: true, // JS não lê: XSS não rouba a sessão
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const accessToken = jar.get(ACCESS)?.value;
  const refreshToken = jar.get(REFRESH)?.value;
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export async function setSession(tokens: Session): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS, tokens.accessToken, { ...base, maxAge: 15 * 60 });
  jar.set(REFRESH, tokens.refreshToken, { ...base, maxAge: 30 * 24 * 60 * 60 });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCESS);
  jar.delete(REFRESH);
}
```

`apps/web/src/lib/api.ts`:
```ts
import "server-only";
import { env } from "@/env";
import { ApiError } from "./errors";
import { getSession, setSession, clearSession } from "./session";

type Options = RequestInit & { auth?: boolean };

async function call<T>(path: string, init: Options, token?: string): Promise<T> {
  // `new Headers()` normaliza as três formas de HeadersInit; espalhar com `...`
  // devolveria {} e sumiria com os headers do chamador em silêncio.
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);

  const res = await fetch(`${env.API_INTERNAL_URL}${path}`, {
    ...init,
    headers,
    // Dado de tenant/usuário: nunca cachear. Cache compartilhado vaza entre tenants.
    cache: "no-store",
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(body?.error?.code ?? "COMMON_500", res.status, body?.error?.details);
  }
  return body as T;
}

/** Chamada sem sessão: signup, login, verificação de email. */
export function apiPublic<T>(path: string, init: RequestInit = {}): Promise<T> {
  return call<T>(path, init);
}

/**
 * Chamada autenticada. Access token expirado (401) dispara uma tentativa de refresh
 * e repete a chamada uma única vez — sem laço, senão um refresh inválido gira para sempre.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await getSession();
  if (!session) throw new ApiError("AUTH_001", 401);

  try {
    return await call<T>(path, init, session.accessToken);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) throw e;

    let renewed: { accessToken: string; refreshToken: string };
    try {
      renewed = await call("/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
    } catch {
      await clearSession();
      throw new ApiError("AUTH_003", 401);
    }

    await setSession(renewed);
    return call<T>(path, init, renewed.accessToken);
  }
}
```

- [ ] **Step 8: Implementar a CSP e o layout raiz**

`apps/web/src/middleware.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  // DENTRO do handler: em escopo de módulo o nonce seria gerado uma vez por processo
  // e serviria todas as respostas — um XSS leria o nonce e a CSP viraria decoração.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join("; ");

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce); // `set`, nunca `append`: sobrescreve o que o cliente mandou

  const res = NextResponse.next({ request: { headers } });
  // Subir primeiro como Report-Only, coletar violações, depois promover para
  // Content-Security-Policy. Trocar o nome do header quando o relatório vier limpo.
  res.headers.set("Content-Security-Policy-Report-Only", csp);
  return res;
}

// Só HTML: sem o matcher, cada asset estático paga o middleware à toa.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```

`apps/web/src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "consusimples",
  description: "Gestão de restaurante",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
```

`apps/web/src/app/globals.css`:
```css
@import "tailwindcss";

/* Foco visível em tudo que recebe foco. Remover outline sem repor é regressão
   de acessibilidade, não escolha de estilo. */
:focus-visible {
  outline: 2px solid theme(colors.sky.600);
  outline-offset: 2px;
}
```

- [ ] **Step 9: Subir e verificar**

Run: `pnpm install && pnpm --filter @consusimples/web dev`
Expected: `localhost:3000` responde 404 (nenhuma rota ainda) com header `Content-Security-Policy-Report-Only` presente.

- [ ] **Step 10: Commit**

```bash
git add apps/web .env.example
git commit -m "feat(web): bootstrap next app with server-only session vault and nonce CSP"
```

---

### Task 2: Blocos de UI reutilizados por todas as telas

**Files:**
- Create: `apps/web/src/components/field.tsx`, `apps/web/src/components/button.tsx`, `apps/web/src/components/empty-state.tsx`, `apps/web/src/components/error-state.tsx`, `apps/web/src/components/modal.tsx`, `apps/web/src/lib/money.ts`
- Test: `apps/web/src/lib/money.spec.ts`

**Interfaces:**
- Consumes: nada além do React
- Produces:
  - `<Field name label error hint type defaultValue required />` — renderiza `<label>` + `<input>` + erro com `aria-describedby`
  - `<Button variant="primary"|"ghost"|"danger" pending>` — desabilita e anuncia `aria-busy` enquanto pendente
  - `<EmptyState title action />`, `<ErrorState message onRetry />`
  - `<Modal open title onClose>` — `<dialog>` nativo, foco preso, fecha no Esc
  - `formatCents(cents: number): string` e `parseCurrencyInput(value: string): number | null`

- [ ] **Step 1: Escrever o teste de dinheiro (falha primeiro)**

`apps/web/src/lib/money.spec.ts`:
```ts
import { formatCents, parseCurrencyInput } from "./money";

describe("formatCents", () => {
  it("formats cents as brazilian currency", () => {
    expect(formatCents(2350)).toBe("R$ 23,50");
    expect(formatCents(0)).toBe("R$ 0,00");
    expect(formatCents(100_000)).toBe("R$ 1.000,00");
  });
});

describe("parseCurrencyInput", () => {
  it("accepts what a brazilian user actually types", () => {
    expect(parseCurrencyInput("23,50")).toBe(2350);
    expect(parseCurrencyInput("R$ 23,50")).toBe(2350);
    expect(parseCurrencyInput("1.000,00")).toBe(100_000);
    expect(parseCurrencyInput("23")).toBe(2300);
    expect(parseCurrencyInput("23,5")).toBe(2350);
  });

  it("rejects garbage instead of guessing", () => {
    expect(parseCurrencyInput("")).toBeNull();
    expect(parseCurrencyInput("abc")).toBeNull();
    expect(parseCurrencyInput("-5,00")).toBeNull();
    expect(parseCurrencyInput("23,555")).toBeNull(); // mais de dois decimais não é centavo
  });

  it("round-trips with formatCents", () => {
    expect(formatCents(parseCurrencyInput("R$ 1.234,56")!)).toBe("R$ 1.234,56");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @consusimples/web test -- money`
Expected: FAIL — `Cannot find module './money'`.

- [ ] **Step 3: Implementar**

`apps/web/src/lib/money.ts`:
```ts
// A API trafega centavos inteiros. Conversão acontece só aqui, na borda de apresentação.
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const formatCents = (cents: number): string => BRL.format(cents / 100);

/** Converte o que o usuário digita em centavos inteiros. `null` quando não dá para confiar. */
export function parseCurrencyInput(value: string): number | null {
  const cleaned = value.replace(/\s|R\$/g, "").replace(/\./g, "");
  if (!/^\d+(,\d{1,2})?$/.test(cleaned)) return null;
  const [reais, decimals = ""] = cleaned.split(",");
  return Number(reais) * 100 + Number(decimals.padEnd(2, "0"));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @consusimples/web test -- money`
Expected: PASS, 3 testes.

- [ ] **Step 5: Implementar os componentes**

`apps/web/src/components/field.tsx`:
```tsx
type Props = {
  name: string;
  label: string;
  type?: string;
  error?: string;
  hint?: string;
  defaultValue?: string | number;
  required?: boolean;
  autoComplete?: string;
};

export function Field({ name, label, type = "text", error, hint, defaultValue, required, autoComplete }: Props) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  // aria-describedby liga a mensagem ao campo: sem isso o leitor de tela anuncia
  // o input e nunca conta por que ele foi recusado.
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium text-slate-700">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="rounded-md border border-slate-300 px-3 py-2 text-base aria-[invalid]:border-red-600"
      />
      {hint && (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
```

`apps/web/src/components/button.tsx`:
```tsx
"use client";
import { useFormStatus } from "react-dom";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  pendingLabel?: string;
};

const STYLES = {
  primary: "bg-sky-700 text-white hover:bg-sky-800",
  ghost: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
  danger: "bg-red-700 text-white hover:bg-red-800",
} as const;

export function Button({ variant = "primary", pendingLabel, children, ...rest }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      {...rest}
      // Altura mínima de 44px: alvo de toque confortável no celular.
      className={`min-h-11 rounded-md px-4 text-sm font-medium disabled:opacity-60 ${STYLES[variant]}`}
      disabled={rest.disabled || pending}
      aria-busy={pending || undefined}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
```

`apps/web/src/components/empty-state.tsx`:
```tsx
// Estado vazio traz ação. "Nenhum registro encontrado" sozinho não ajuda ninguém.
export function EmptyState({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 p-10 text-center">
      <p className="text-sm text-slate-600">{title}</p>
      {action}
    </div>
  );
}
```

`apps/web/src/components/error-state.tsx`:
```tsx
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-8 text-center">
      <p className="text-sm text-red-800">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="min-h-11 rounded-md border border-red-300 bg-white px-4 text-sm">
          Tentar de novo
        </button>
      )}
    </div>
  );
}
```

`apps/web/src/components/modal.tsx`:
```tsx
"use client";
import { useEffect, useRef } from "react";

// <dialog> nativo com showModal(): foco preso, Esc fecha e inerte no resto da página,
// tudo sem biblioteca. Reimplementar isso à mão é onde a acessibilidade morre.
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="modal-title"
      className="w-full max-w-lg rounded-lg p-0 backdrop:bg-slate-900/40"
    >
      <div className="flex items-center justify-between border-b border-slate-200 p-4">
        <h2 id="modal-title" className="text-base font-semibold">
          {title}
        </h2>
        <button onClick={onClose} aria-label="Fechar" className="min-h-11 px-2 text-slate-500">
          ✕
        </button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components apps/web/src/lib/money.ts apps/web/src/lib/money.spec.ts
git commit -m "feat(web): add accessible field, button, modal and state building blocks"
```

---

### Task 3: Telas públicas de cadastro e verificação

**Files:**
- Create: `apps/web/src/app/(public)/layout.tsx`, `apps/web/src/app/(public)/cadastrar/page.tsx`, `apps/web/src/app/(public)/cadastrar/actions.ts`, `apps/web/src/app/(public)/cadastrar/signup-form.tsx`, `apps/web/src/app/(public)/confirme-seu-email/page.tsx`, `apps/web/src/app/(public)/verificar-email/page.tsx`
- Test: `apps/web/e2e/signup.spec.ts`

**Interfaces:**
- Consumes: `apiPublic` (Task 1), `signupSchema` de `@consusimples/validation`, `<Field>`/`<Button>` (Task 2)
- Produces:
  - `signupAction(_prev: FormState, formData: FormData): Promise<FormState>` onde `FormState = { error?: string; fieldErrors?: Record<string, string> }`
  - Rotas `/cadastrar`, `/confirme-seu-email`, `/verificar-email?token=…`

- [ ] **Step 1: Escrever o teste e2e (falha primeiro)**

`apps/web/e2e/signup.spec.ts`:
```ts
import { expect, test } from "@playwright/test";

test.describe("signup", () => {
  test("shows field errors without leaving the page", async ({ page }) => {
    await page.goto("/cadastrar");
    await page.getByLabel("Nome do restaurante").fill("A");
    await page.getByLabel("Seu nome").fill("José");
    await page.getByLabel("Email").fill("nao-e-email");
    await page.getByLabel("Senha").fill("curta");
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(page).toHaveURL(/\/cadastrar/);
    await expect(page.getByRole("alert").first()).toBeVisible();
  });

  test("links each error message to its input", async ({ page }) => {
    await page.goto("/cadastrar");
    await page.getByLabel("Senha").fill("curta");
    await page.getByRole("button", { name: "Criar conta" }).click();

    const input = page.getByLabel("Senha");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = await input.getAttribute("aria-describedby");
    expect(describedBy).toContain("password-error");
  });

  test("creates the account and lands on the confirmation screen", async ({ page }) => {
    const email = `teste-${Date.now()}@bar.com`;
    await page.goto("/cadastrar");
    await page.getByLabel("Nome do restaurante").fill("Bar do Playwright");
    await page.getByLabel("Seu nome").fill("José");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Senha").fill("senha-bem-comprida");
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(page).toHaveURL(/\/confirme-seu-email/);
    await expect(page.getByText(/confirme seu email/i)).toBeVisible();
  });

  test("works at 360x740", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/cadastrar");
    // Nenhum scroll horizontal: a largura do documento não passa da viewport.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    await expect(page.getByRole("button", { name: "Criar conta" })).toBeVisible();
  });
});
```

`apps/web/playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @consusimples/web e2e -- signup`
Expected: FAIL — `/cadastrar` responde 404.

- [ ] **Step 3: Implementar o layout público**

`apps/web/src/app/(public)/layout.tsx`:
```tsx
// Layout das telas públicas: usável a partir de 360px de largura, porque o garçom
// entra pelo celular. `min-h-dvh` respeita a barra do navegador móvel.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-8">
      {children}
    </main>
  );
}
```

- [ ] **Step 4: Implementar a Server Action de signup**

`apps/web/src/app/(public)/cadastrar/actions.ts`:
```ts
"use server";
import { redirect } from "next/navigation";
import { signupSchema } from "@consusimples/validation";
import { apiPublic } from "@/lib/api";
import { messageFor } from "@/lib/errors";

export type FormState = { error?: string; fieldErrors?: Record<string, string> };

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // Toda Server Action é um endpoint HTTP público: valida aqui, não confia na UI.
  const parsed = signupSchema.safeParse({
    restaurantName: formData.get("restaurantName"),
    ownerName: formData.get("ownerName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors };
  }

  try {
    await apiPublic("/auth/signup", { method: "POST", body: JSON.stringify(parsed.data) });
  } catch (e) {
    return { error: messageFor(e) };
  }

  // redirect() lança: precisa ficar FORA do try, senão o catch engole o controle de fluxo.
  redirect("/confirme-seu-email");
}
```

- [ ] **Step 5: Implementar o formulário e as páginas**

`apps/web/src/app/(public)/cadastrar/signup-form.tsx`:
```tsx
"use client";
import { useActionState } from "react";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { signupAction, type FormState } from "./actions";

const INITIAL: FormState = {};

export function SignupForm() {
  const [state, action] = useActionState(signupAction, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <Field
        name="restaurantName"
        label="Nome do restaurante"
        required
        error={state.fieldErrors?.restaurantName}
        autoComplete="organization"
      />
      <Field
        name="ownerName"
        label="Seu nome"
        required
        error={state.fieldErrors?.ownerName}
        autoComplete="name"
      />
      <Field
        name="email"
        label="Email"
        type="email"
        required
        error={state.fieldErrors?.email}
        autoComplete="email"
      />
      <Field
        name="password"
        label="Senha"
        type="password"
        required
        hint="No mínimo 12 caracteres."
        error={state.fieldErrors?.password}
        autoComplete="new-password"
      />
      <Button type="submit" pendingLabel="Criando…">
        Criar conta
      </Button>
    </form>
  );
}
```

`apps/web/src/app/(public)/cadastrar/page.tsx`:
```tsx
import Link from "next/link";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Criar conta</h1>
        <p className="mt-1 text-sm text-slate-600">
          Cadastre seu restaurante e comece a montar o cardápio.
        </p>
      </div>
      <SignupForm />
      <p className="text-sm text-slate-600">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-medium text-sky-700 underline">
          Entrar
        </Link>
      </p>
    </>
  );
}
```

`apps/web/src/app/(public)/confirme-seu-email/page.tsx`:
```tsx
export default function CheckEmailPage() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">Confirme seu email</h1>
      <p className="text-sm text-slate-600">
        Enviamos um link para o email cadastrado. Ele vale por 24 horas — abra para liberar o acesso
        ao restaurante.
      </p>
      <p className="text-sm text-slate-600">
        Não chegou? Confira a caixa de spam antes de tentar de novo.
      </p>
    </div>
  );
}
```

`apps/web/src/app/(public)/verificar-email/page.tsx`:
```tsx
import Link from "next/link";
import { apiPublic } from "@/lib/api";

// Server Component: consome o token no servidor e mostra o resultado. Nenhum
// estado de client, nenhum useEffect.
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return <Result ok={false} message="Link incompleto. Abra o link direto do email." />;
  }

  try {
    await apiPublic("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
    return <Result ok message="Email confirmado. Agora é só entrar." />;
  } catch {
    return <Result ok={false} message="Link inválido ou expirado. Faça o cadastro de novo." />;
  }
}

function Result({ ok, message }: { ok: boolean; message: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{ok ? "Tudo certo" : "Não deu"}</h1>
      <p role={ok ? undefined : "alert"} className="text-sm text-slate-600">
        {message}
      </p>
      <Link href={ok ? "/entrar" : "/cadastrar"} className="font-medium text-sky-700 underline">
        {ok ? "Ir para o login" : "Voltar ao cadastro"}
      </Link>
    </div>
  );
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: com a API rodando em `localhost:3001`, `pnpm --filter @consusimples/web e2e -- signup`
Expected: PASS, 4 testes.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/\(public\) apps/web/e2e/signup.spec.ts apps/web/playwright.config.ts
git commit -m "feat(web): signup, email confirmation and verification screens"
```

---

### Task 4: Login e shell autenticado

**Files:**
- Create: `apps/web/src/app/(public)/entrar/page.tsx`, `apps/web/src/app/(public)/entrar/actions.ts`, `apps/web/src/app/(public)/entrar/login-form.tsx`, `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/app/(app)/page.tsx`, `apps/web/src/app/(app)/nav.tsx`, `apps/web/src/app/(app)/logout-action.ts`
- Test: `apps/web/e2e/auth.spec.ts`

**Interfaces:**
- Consumes: `apiPublic`, `setSession`, `getSession`, `clearSession` (Task 1), `loginSchema`
- Produces:
  - `loginAction(_prev: FormState, formData: FormData): Promise<FormState>`
  - `logoutAction(): Promise<void>`
  - `requireSession(): Promise<AuthUser>` em `@/lib/auth` — redireciona para `/entrar` quando não há sessão
  - `type AuthUser = { id: string; name: string; role: "OWNER" | "MANAGER" | "WAITER" | "KITCHEN" | "CASHIER"; tenantId: string }`

- [ ] **Step 1: Escrever o teste e2e (falha primeiro)**

`apps/web/e2e/auth.spec.ts`:
```ts
import { expect, test } from "@playwright/test";

// Conta criada uma vez e reaproveitada: o e2e roda contra a API de verdade.
const EMAIL = `login-${Date.now()}@bar.com`;
const PASSWORD = "senha-bem-comprida";

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
    const first = await page.getByRole("alert").first().textContent();

    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Senha").fill("outra-senha-errada");
    await page.getByRole("button", { name: "Entrar" }).click();
    const second = await page.getByRole("alert").first().textContent();

    expect(first).toBe(second);
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
```

Antes de rodar, criar a conta usada pelo teste — um `globalSetup` do Playwright que chama a API:

`apps/web/e2e/global-setup.ts`:
```ts
export default async function globalSetup() {
  const email = process.env.E2E_EMAIL!;
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
  // O e2e roda contra um banco de teste: ativar direto é aceitável aqui e só aqui.
  // O script de ativação vive em apps/api/scripts/activate-tenant.ts (criado neste step).
}
```

`apps/api/scripts/activate-tenant.ts` — usado só por ambiente de teste, nunca em produção:
```ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const email = process.argv[2];
if (!email) throw new Error("uso: tsx activate-tenant.ts <email>");

const user = await prisma.user.findUniqueOrThrow({ where: { email } });
await prisma.tenant.update({ where: { id: user.tenantId }, data: { status: "ACTIVE" } });
await prisma.$disconnect();
console.log(`tenant de ${email} ativado`);
```

Atualizar `playwright.config.ts` para usar o setup:
```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: "http://localhost:3000" },
  webServer: { command: "pnpm dev", url: "http://localhost:3000", reuseExistingServer: true },
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @consusimples/web e2e -- auth`
Expected: FAIL — `/entrar` responde 404.

- [ ] **Step 3: Implementar a Server Action de login**

`apps/web/src/app/(public)/entrar/actions.ts`:
```ts
"use server";
import { redirect } from "next/navigation";
import { loginSchema } from "@consusimples/validation";
import { apiPublic } from "@/lib/api";
import { messageFor } from "@/lib/errors";
import { setSession } from "@/lib/session";

export type FormState = { error?: string };

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; role: string; tenantId: string };
};

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  // Mensagem única: dizer "email inválido" já diferencia os casos para quem sonda.
  if (!parsed.success) return { error: "Email ou senha inválidos." };

  let session: LoginResponse;
  try {
    session = await apiPublic<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
  } catch (e) {
    return { error: messageFor(e) };
  }

  await setSession({ accessToken: session.accessToken, refreshToken: session.refreshToken });
  redirect("/cardapio");
}
```

- [ ] **Step 4: Implementar a tela de login**

`apps/web/src/app/(public)/entrar/login-form.tsx`:
```tsx
"use client";
import { useActionState } from "react";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { loginAction, type FormState } from "./actions";

const INITIAL: FormState = {};

export function LoginForm() {
  const [state, action] = useActionState(loginAction, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <Field name="email" label="Email" type="email" required autoComplete="email" />
      <Field name="password" label="Senha" type="password" required autoComplete="current-password" />
      <Button type="submit" pendingLabel="Entrando…">
        Entrar
      </Button>
    </form>
  );
}
```

`apps/web/src/app/(public)/entrar/page.tsx`:
```tsx
import Link from "next/link";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Entrar</h1>
      <LoginForm />
      <p className="text-sm text-slate-600">
        Ainda não tem conta?{" "}
        <Link href="/cadastrar" className="font-medium text-sky-700 underline">
          Cadastrar restaurante
        </Link>
      </p>
    </>
  );
}
```

- [ ] **Step 5: Implementar o shell autenticado**

`apps/web/src/app/(app)/logout-action.ts`:
```ts
"use server";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { clearSession } from "@/lib/session";

export async function logoutAction(): Promise<void> {
  // Revogar no servidor antes de limpar o cookie: cookie apagado sem revogação
  // deixa o refresh token válido em qualquer cópia que tenha vazado.
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } catch {
    // Sessão já inválida do lado da API: seguir e limpar mesmo assim.
  }
  await clearSession();
  redirect("/entrar");
}
```

`apps/web/src/app/(app)/nav.tsx`:
```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/button";
import { logoutAction } from "./logout-action";

const LINKS = [
  { href: "/cardapio", label: "Cardápio", roles: ["OWNER", "MANAGER", "WAITER", "KITCHEN", "CASHIER"] },
  { href: "/usuarios", label: "Usuários", roles: ["OWNER", "MANAGER"] },
] as const;

export function Nav({ role, userName }: { role: string; userName: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Principal" className="flex w-56 shrink-0 flex-col justify-between border-r border-slate-200 bg-white p-4">
      <ul className="flex flex-col gap-1">
        {/* Esconder o link não é autorização — a API barra de novo. Isto é só ergonomia. */}
        {LINKS.filter((l) => l.roles.includes(role as never)).map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={pathname.startsWith(l.href) ? "page" : undefined}
              className="block rounded-md px-3 py-2 text-sm aria-[current]:bg-sky-50 aria-[current]:font-medium aria-[current]:text-sky-800"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
      <form action={logoutAction} className="flex flex-col gap-2">
        <p className="px-3 text-xs text-slate-500">{userName}</p>
        <Button variant="ghost" type="submit">
          Sair
        </Button>
      </form>
    </nav>
  );
}
```

`apps/web/src/lib/auth.ts` — guarda de sessão. Vive em `lib/`, não no `layout.tsx`: função exportada de um arquivo de rota é import frágil e o Next pode tratá-lo de forma especial.
```ts
import "server-only";
import { redirect } from "next/navigation";
import { apiFetch } from "./api";
import { getSession } from "./session";

export type AuthUser = {
  id: string;
  name: string;
  role: "OWNER" | "MANAGER" | "WAITER" | "KITCHEN" | "CASHIER";
  tenantId: string;
};

/** Exige sessão válida. Quem é o usuário quem diz é a API — o Next não decodifica o token. */
export async function requireSession(): Promise<AuthUser> {
  const session = await getSession();
  if (!session) redirect("/entrar");
  try {
    return await apiFetch<AuthUser>("/auth/me");
  } catch {
    redirect("/entrar");
  }
}
```

`apps/web/src/app/(app)/layout.tsx`:
```tsx
import { requireSession } from "@/lib/auth";
import { Nav } from "./nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  return (
    <div className="flex min-h-dvh">
      <Nav role={user.role} userName={user.name} />
      {/* min-w-0 impede que uma tabela larga estoure o flex e crie scroll horizontal na página. */}
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
```

`apps/web/src/app/(app)/page.tsx`:
```tsx
import { redirect } from "next/navigation";

export default function AppIndex() {
  redirect("/cardapio");
}
```

- [ ] **Step 6: Adicionar `GET /auth/me` na API**

O shell precisa do papel e do nome, e o access token não deve ser decodificado no Next — quem conhece o formato do token é a API.

Em `apps/api/src/auth/auth.controller.ts`:
```ts
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.sub, user.tenantId);
  }
```
(adicionar `Get` aos imports de `@nestjs/common`)

Em `apps/api/src/auth/auth.service.ts`:
```ts
  async me(userId: string, tenantId: string) {
    // findFirst com tenantId: o token traz os dois, e os dois precisam bater.
    const user = await this.repo.findByIdScoped(tenantId, userId);
    if (!user) throw new AppError("AUTH_001", "Sessão inválida", 401);
    return { id: user.id, name: user.name, role: user.role, tenantId: user.tenantId };
  }
```

Em `apps/api/src/auth/auth.repository.ts`:
```ts
  findByIdScoped(tenantId: string, id: string) {
    return this.prisma.user.findFirst({
      where: { id, tenantId, status: "ACTIVE" },
      select: { id: true, name: true, role: true, tenantId: true },
    });
  }
```

Teste correspondente, em `apps/api/test/login.e2e-spec.ts`:
```ts
  it("returns the current user from the token", async () => {
    const user = await seedUser();
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "ze@bar.com", password: PASSWORD })
      .expect(200);

    const me = await request(app.getHttpServer())
      .get("/auth/me")
      .set("authorization", `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(me.body).toEqual({
      id: user.id,
      name: user.name,
      role: "OWNER",
      tenantId: user.tenantId,
    });
  });
```

Run: `pnpm --filter @consusimples/api test -- login.e2e`
Expected: PASS, 10 testes.

- [ ] **Step 7: Rodar o e2e e ver passar**

Run: `E2E_EMAIL=$EMAIL pnpm --filter @consusimples/web e2e -- auth`
Expected: PASS, 4 testes.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app apps/web/e2e apps/api/src/auth apps/api/test/login.e2e-spec.ts
git commit -m "feat(web): login with httpOnly session cookies and authenticated app shell"
```

---

### Task 5: Onboarding e tela de cardápio

**Files:**
- Create: `apps/web/src/app/(app)/onboarding/page.tsx`, `apps/web/src/app/(app)/onboarding/actions.ts`, `apps/web/src/app/(app)/cardapio/page.tsx`, `apps/web/src/app/(app)/cardapio/actions.ts`, `apps/web/src/app/(app)/cardapio/category-list.tsx`, `apps/web/src/app/(app)/cardapio/product-table.tsx`, `apps/web/src/app/(app)/cardapio/product-form-modal.tsx`
- Test: `apps/web/e2e/catalog.spec.ts`

**Interfaces:**
- Consumes: `apiFetch` (Task 1), `requireSession` (Task 4), `formatCents`/`parseCurrencyInput` (Task 2), schemas de catálogo
- Produces:
  - `createCategoryAction`, `createProductAction`, `updateProductAction`, `deleteProductAction` — todas `(prev, formData) => Promise<FormState>`
  - Rotas `/onboarding` e `/cardapio?categoria=<id>`

- [ ] **Step 1: Escrever o teste e2e (falha primeiro)**

`apps/web/e2e/catalog.spec.ts`:
```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `E2E_EMAIL=$EMAIL pnpm --filter @consusimples/web e2e -- catalog`
Expected: FAIL — `/cardapio` responde 404.

- [ ] **Step 3: Implementar o onboarding**

`apps/web/src/app/(app)/onboarding/actions.ts`:
```ts
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiFetch } from "@/lib/api";
import { messageFor } from "@/lib/errors";

// Schema local: este endpoint é do próprio Next, não tem par no pacote compartilhado.
const schema = z.object({
  name: z.string().min(2).max(120).trim(),
  timezone: z.string().min(3).max(64),
});

export type FormState = { error?: string; fieldErrors?: Record<string, string> };

export async function completeOnboardingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) {
    return { fieldErrors: { name: "Informe um nome com pelo menos 2 caracteres." } };
  }

  try {
    await apiFetch("/tenant", { method: "PATCH", body: JSON.stringify(parsed.data) });
  } catch (e) {
    return { error: messageFor(e) };
  }

  revalidatePath("/cardapio");
  redirect("/cardapio");
}
```

Isso exige um endpoint novo na API. Em `apps/api/src/users/users.controller.ts` não cabe — criar `apps/api/src/tenant/tenant.controller.ts`:
```ts
import { Body, Controller, Patch } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser, Roles } from "@/common/decorators";
import { ZodValidationPipe } from "@/common/zod-validation.pipe";
import type { AuthUser } from "@/auth/token.service";
import { PrismaService } from "@/prisma/prisma.service";

const updateTenantSchema = z
  .object({ name: z.string().min(2).max(120).trim(), timezone: z.string().min(3).max(64) })
  .partial()
  .strict();

@Roles("OWNER", "MANAGER")
@Controller("tenant")
export class TenantController {
  constructor(private readonly prisma: PrismaService) {}

  @Patch()
  async update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateTenantSchema)) dto: { name?: string; timezone?: string },
  ) {
    // O id vem do token, nunca do payload: não existe caminho para editar outro tenant.
    const tenant = await this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: dto,
      select: { id: true, name: true, timezone: true },
    });
    return tenant;
  }
}
```
Registrar num `TenantModule` e adicionar aos `imports` do `AppModule`, no mesmo formato dos outros módulos.

`apps/web/src/app/(app)/onboarding/page.tsx`:
```tsx
import { requireSession } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const user = await requireSession();
  if (user.role !== "OWNER" && user.role !== "MANAGER") {
    return <p role="alert">Peça ao dono do restaurante para concluir a configuração.</p>;
  }
  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold">Configurar restaurante</h1>
      <p className="mt-1 text-sm text-slate-600">Um passo só. Dá para mudar depois.</p>
      <div className="mt-6">
        <OnboardingForm />
      </div>
    </div>
  );
}
```

`apps/web/src/app/(app)/onboarding/onboarding-form.tsx`:
```tsx
"use client";
import { useActionState } from "react";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { completeOnboardingAction, type FormState } from "./actions";

const INITIAL: FormState = {};

export function OnboardingForm() {
  const [state, action] = useActionState(completeOnboardingAction, INITIAL);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <Field name="name" label="Nome do restaurante" required error={state.fieldErrors?.name} />
      <Field
        name="timezone"
        label="Fuso horário"
        defaultValue="America/Sao_Paulo"
        hint="Nome IANA, por exemplo America/Sao_Paulo."
        required
      />
      <Button type="submit" pendingLabel="Salvando…">
        Salvar
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Implementar as Server Actions do catálogo**

`apps/web/src/app/(app)/cardapio/actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { createCategorySchema, createProductSchema, updateProductSchema } from "@consusimples/validation";
import { apiFetch } from "@/lib/api";
import { messageFor } from "@/lib/errors";
import { parseCurrencyInput } from "@/lib/money";

export type FormState = { error?: string; fieldErrors?: Record<string, string>; ok?: boolean };

const issuesToFields = (issues: { path: (string | number)[]; message: string }[]) => {
  const fieldErrors: Record<string, string> = {};
  for (const i of issues) fieldErrors[String(i.path[0])] ??= i.message;
  return fieldErrors;
};

export async function createCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = createCategorySchema.safeParse({
    name: formData.get("name"),
    sortOrder: Number(formData.get("sortOrder") ?? 0),
  });
  if (!parsed.success) return { fieldErrors: issuesToFields(parsed.error.issues) };

  try {
    await apiFetch("/categories", { method: "POST", body: JSON.stringify(parsed.data) });
  } catch (e) {
    return { error: messageFor(e) };
  }
  revalidatePath("/cardapio");
  return { ok: true };
}

export async function createProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // O usuário digita "23,50"; o contrato da API é centavo inteiro.
  const priceCents = parseCurrencyInput(String(formData.get("price") ?? ""));
  if (priceCents === null) {
    return { fieldErrors: { price: "Informe um valor como 23,50." } };
  }

  const parsed = createProductSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    categoryId: formData.get("categoryId"),
    priceCents,
    available: formData.get("available") === "on",
    sortOrder: Number(formData.get("sortOrder") ?? 0),
  });
  if (!parsed.success) return { fieldErrors: issuesToFields(parsed.error.issues) };

  try {
    await apiFetch("/products", { method: "POST", body: JSON.stringify(parsed.data) });
  } catch (e) {
    return { error: messageFor(e) };
  }
  revalidatePath("/cardapio");
  return { ok: true };
}

export async function updateProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Produto não encontrado." };

  const rawPrice = String(formData.get("price") ?? "");
  const priceCents = parseCurrencyInput(rawPrice);
  if (priceCents === null) return { fieldErrors: { price: "Informe um valor como 23,50." } };

  const parsed = updateProductSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    priceCents,
    available: formData.get("available") === "on",
  });
  if (!parsed.success) return { fieldErrors: issuesToFields(parsed.error.issues) };

  try {
    await apiFetch(`/products/${id}`, { method: "PATCH", body: JSON.stringify(parsed.data) });
  } catch (e) {
    return { error: messageFor(e) };
  }
  revalidatePath("/cardapio");
  return { ok: true };
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // Falha aqui é silenciosa de propósito: o revalidate mostra o estado real do servidor.
  try {
    await apiFetch(`/products/${id}`, { method: "DELETE" });
  } catch {
    /* estado real reaparece no reload */
  }
  revalidatePath("/cardapio");
}
```

- [ ] **Step 5: Implementar a tela de cardápio**

`apps/web/src/app/(app)/cardapio/page.tsx`:
```tsx
import { apiFetch } from "@/lib/api";
import { ErrorState } from "@/components/error-state";
import { requireSession } from "@/lib/auth";
import { CategoryList } from "./category-list";
import { ProductTable } from "./product-table";

type Category = { id: string; name: string; sortOrder: number; active: boolean };
type Product = {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  priceCents: number;
  available: boolean;
  sortOrder: number;
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  const user = await requireSession();
  const { categoria } = await searchParams;
  const canEdit = user.role === "OWNER" || user.role === "MANAGER";

  let categories: Category[];
  let products: Product[];
  try {
    // Paralelo: em série seriam dois RTTs para renderizar uma tela só.
    [categories, products] = await Promise.all([
      apiFetch<Category[]>("/categories"),
      apiFetch<Product[]>(`/products${categoria ? `?categoryId=${categoria}` : ""}`),
    ]);
  } catch {
    return <ErrorState message="Não conseguimos carregar o cardápio agora." />;
  }

  const selected = categoria ?? categories[0]?.id;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Cardápio</h1>
        <p className="text-sm text-slate-600">
          {canEdit ? "Organize categorias e produtos." : "Você tem acesso de leitura."}
        </p>
      </header>

      <div className="flex gap-6">
        <CategoryList categories={categories} selectedId={selected} canEdit={canEdit} />
        <div className="min-w-0 flex-1">
          <ProductTable
            products={products.filter((p) => !selected || p.categoryId === selected)}
            categoryId={selected}
            canEdit={canEdit}
          />
        </div>
      </div>
    </div>
  );
}
```

`apps/web/src/app/(app)/cardapio/category-list.tsx`:
```tsx
"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { Modal } from "@/components/modal";
import { createCategoryAction, type FormState } from "./actions";

const INITIAL: FormState = {};

type Category = { id: string; name: string };

export function CategoryList({
  categories,
  selectedId,
  canEdit,
}: {
  categories: Category[];
  selectedId?: string;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createCategoryAction, INITIAL);

  // Fecha o modal quando a action confirma sucesso.
  if (state.ok && open) setOpen(false);

  return (
    <aside className="w-56 shrink-0">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Categorias</h2>
        {canEdit && (
          <button onClick={() => setOpen(true)} className="min-h-11 text-sm text-sky-700 underline">
            Nova categoria
          </button>
        )}
      </div>

      {categories.length === 0 ? (
        <EmptyState
          title="Nenhuma categoria ainda."
          action={
            canEdit ? (
              <button onClick={() => setOpen(true)} className="min-h-11 text-sm text-sky-700 underline">
                Criar a primeira
              </button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-1">
          {categories.map((c) => (
            <li key={c.id}>
              <Link
                href={`/cardapio?categoria=${c.id}`}
                aria-current={c.id === selectedId ? "page" : undefined}
                className="block rounded-md px-3 py-2 text-sm aria-[current]:bg-sky-50 aria-[current]:font-medium"
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} title="Nova categoria" onClose={() => setOpen(false)}>
        <form action={action} className="flex flex-col gap-4" noValidate>
          {state.error && (
            <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
              {state.error}
            </p>
          )}
          <Field name="name" label="Nome" required error={state.fieldErrors?.name} />
          <Field name="sortOrder" label="Ordem" type="number" defaultValue={0} />
          <Button type="submit" pendingLabel="Salvando…">
            Salvar
          </Button>
        </form>
      </Modal>
    </aside>
  );
}
```

`apps/web/src/app/(app)/cardapio/product-table.tsx`:
```tsx
"use client";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { formatCents } from "@/lib/money";
import { deleteProductAction } from "./actions";
import { ProductFormModal } from "./product-form-modal";

type Product = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  available: boolean;
};

export function ProductTable({
  products,
  categoryId,
  canEdit,
}: {
  products: Product[];
  categoryId?: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  if (!categoryId) {
    return <EmptyState title="Escolha ou crie uma categoria para começar." />;
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Produtos</h2>
        {canEdit && (
          <button onClick={() => setCreating(true)} className="min-h-11 text-sm text-sky-700 underline">
            Novo produto
          </button>
        )}
      </div>

      {products.length === 0 ? (
        <EmptyState
          title="Nenhum produto nesta categoria."
          action={
            canEdit ? (
              <button onClick={() => setCreating(true)} className="min-h-11 text-sm text-sky-700 underline">
                Criar o primeiro
              </button>
            ) : undefined
          }
        />
      ) : (
        // overflow-x-auto no contêiner da tabela, não na página: a tabela rola,
        // o resto da tela fica no lugar.
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">Produtos da categoria selecionada</caption>
            <thead className="bg-slate-50 text-left">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Nome</th>
                <th scope="col" className="px-4 py-2 font-medium">Preço</th>
                <th scope="col" className="px-4 py-2 font-medium">Disponível</th>
                {canEdit && <th scope="col" className="px-4 py-2"><span className="sr-only">Ações</span></th>}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2">{formatCents(p.priceCents)}</td>
                  <td className="px-4 py-2">{p.available ? "Sim" : "Não"}</td>
                  {canEdit && (
                    <td className="flex gap-2 px-4 py-2">
                      <button onClick={() => setEditing(p)} className="min-h-11 text-sky-700 underline">
                        Editar
                      </button>
                      <form action={deleteProductAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="min-h-11 text-red-700 underline">
                          Remover
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <ProductFormModal
          open={creating || editing !== null}
          product={editing}
          categoryId={categoryId}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}
```

`apps/web/src/app/(app)/cardapio/product-form-modal.tsx`:
```tsx
"use client";
import { useActionState } from "react";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Modal } from "@/components/modal";
import { formatCents } from "@/lib/money";
import { createProductAction, updateProductAction, type FormState } from "./actions";

const INITIAL: FormState = {};

type Product = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  available: boolean;
};

export function ProductFormModal({
  open,
  product,
  categoryId,
  onClose,
}: {
  open: boolean;
  product: Product | null;
  categoryId: string;
  onClose: () => void;
}) {
  const isEdit = product !== null;
  const [state, action] = useActionState(isEdit ? updateProductAction : createProductAction, INITIAL);

  if (state.ok && open) onClose();

  return (
    <Modal open={open} title={isEdit ? "Editar produto" : "Novo produto"} onClose={onClose}>
      {/* key força o form a remontar ao trocar de produto: sem isso os defaultValue
          continuam mostrando o item anterior. */}
      <form key={product?.id ?? "new"} action={action} className="flex flex-col gap-4" noValidate>
        {state.error && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {state.error}
          </p>
        )}
        {isEdit && <input type="hidden" name="id" value={product.id} />}
        <input type="hidden" name="categoryId" value={categoryId} />

        <Field name="name" label="Nome" required defaultValue={product?.name} error={state.fieldErrors?.name} />
        <Field
          name="description"
          label="Descrição"
          defaultValue={product?.description ?? undefined}
          error={state.fieldErrors?.description}
        />
        <Field
          name="price"
          label="Preço"
          required
          defaultValue={product ? formatCents(product.priceCents).replace("R$ ", "") : undefined}
          hint="Use vírgula: 23,50."
          error={state.fieldErrors?.price ?? state.fieldErrors?.priceCents}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="available" defaultChecked={product?.available ?? true} />
          Disponível para venda
        </label>
        <Button type="submit" pendingLabel="Salvando…">
          Salvar
        </Button>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `E2E_EMAIL=$EMAIL pnpm --filter @consusimples/web e2e -- catalog`
Expected: PASS, 4 testes.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/\(app\) apps/web/e2e/catalog.spec.ts apps/api/src/tenant apps/api/src/app.module.ts
git commit -m "feat(web): catalog screen with category sidebar, product table and onboarding"
```

---

### Task 6: Tela de usuários e o checklist final de tela

**Files:**
- Create: `apps/web/src/app/(app)/usuarios/page.tsx`, `apps/web/src/app/(app)/usuarios/actions.ts`, `apps/web/src/app/(app)/usuarios/user-table.tsx`, `apps/web/src/app/(app)/usuarios/user-form-modal.tsx`
- Test: `apps/web/e2e/users.spec.ts`

**Interfaces:**
- Consumes: `apiFetch`, `requireSession`, `createUserSchema`/`updateUserSchema`
- Produces: `createUserAction`, `updateUserAction`, `disableUserAction`; rota `/usuarios`

- [ ] **Step 1: Escrever o teste e2e (falha primeiro)**

`apps/web/e2e/users.spec.ts`:
```ts
import { expect, test } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL!;
const PASSWORD = "senha-bem-comprida";

test.beforeEach(async ({ page }) => {
  await page.goto("/entrar");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
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

test("shows the server error when disabling the last owner", async ({ page }) => {
  const row = page.getByRole("row").filter({ hasText: "OWNER" }).first();
  await row.getByRole("button", { name: "Desativar" }).click();
  await expect(page.getByRole("alert")).toContainText(/dono ativo/i);
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `E2E_EMAIL=$EMAIL pnpm --filter @consusimples/web e2e -- users`
Expected: FAIL — `/usuarios` responde 404.

- [ ] **Step 3: Implementar as actions**

`apps/web/src/app/(app)/usuarios/actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { createUserSchema, updateUserSchema } from "@consusimples/validation";
import { apiFetch } from "@/lib/api";
import { messageFor } from "@/lib/errors";

export type FormState = { error?: string; fieldErrors?: Record<string, string>; ok?: boolean };

const issuesToFields = (issues: { path: (string | number)[]; message: string }[]) => {
  const fieldErrors: Record<string, string> = {};
  for (const i of issues) fieldErrors[String(i.path[0])] ??= i.message;
  return fieldErrors;
};

export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { fieldErrors: issuesToFields(parsed.error.issues) };

  try {
    await apiFetch("/users", { method: "POST", body: JSON.stringify(parsed.data) });
  } catch (e) {
    return { error: messageFor(e) };
  }
  revalidatePath("/usuarios");
  return { ok: true };
}

export async function updateUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Usuário não encontrado." };

  const parsed = updateUserSchema.safeParse({
    name: formData.get("name"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { fieldErrors: issuesToFields(parsed.error.issues) };

  try {
    await apiFetch(`/users/${id}`, { method: "PATCH", body: JSON.stringify(parsed.data) });
  } catch (e) {
    return { error: messageFor(e) };
  }
  revalidatePath("/usuarios");
  return { ok: true };
}

export async function disableUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Usuário não encontrado." };

  try {
    await apiFetch(`/users/${id}`, { method: "DELETE" });
  } catch (e) {
    // O erro do último dono (USER_002) precisa chegar na tela, não sumir.
    return { error: messageFor(e) };
  }
  revalidatePath("/usuarios");
  return { ok: true };
}
```

- [ ] **Step 4: Implementar a página e os componentes**

`apps/web/src/app/(app)/usuarios/page.tsx`:
```tsx
import { apiFetch } from "@/lib/api";
import { ErrorState } from "@/components/error-state";
import { requireSession } from "@/lib/auth";
import { UserTable } from "./user-table";

type User = {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "MANAGER" | "WAITER" | "KITCHEN" | "CASHIER";
  status: "ACTIVE" | "DISABLED";
  lastLoginAt: string | null;
};

export default async function UsersPage() {
  const me = await requireSession();

  // Estado "sem permissão" é um dos cinco obrigatórios: quem não pode ver
  // recebe explicação, não uma tela quebrada nem um redirect misterioso.
  if (me.role !== "OWNER" && me.role !== "MANAGER") {
    return (
      <div role="alert" className="rounded-lg border border-slate-200 bg-white p-8">
        <h1 className="text-lg font-semibold">Sem permissão</h1>
        <p className="mt-1 text-sm text-slate-600">
          Só o dono e o gerente administram usuários. Fale com um deles se precisar de acesso.
        </p>
      </div>
    );
  }

  let users: User[];
  try {
    users = await apiFetch<User[]>("/users");
  } catch {
    return <ErrorState message="Não conseguimos carregar os usuários agora." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Usuários</h1>
        <p className="text-sm text-slate-600">Quem trabalha no restaurante e o que cada um acessa.</p>
      </header>
      <UserTable users={users} currentUserId={me.id} />
    </div>
  );
}
```

`apps/web/src/app/(app)/usuarios/user-table.tsx`:
```tsx
"use client";
import { useActionState, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { disableUserAction, type FormState } from "./actions";
import { UserFormModal } from "./user-form-modal";

const INITIAL: FormState = {};

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Dono",
  MANAGER: "Gerente",
  WAITER: "Garçom",
  KITCHEN: "Cozinha",
  CASHIER: "Caixa",
};

type User = {
  id: string;
  name: string;
  email: string;
  role: keyof typeof ROLE_LABEL;
  status: "ACTIVE" | "DISABLED";
  lastLoginAt: string | null;
};

export function UserTable({ users, currentUserId }: { users: User[]; currentUserId: string }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [state, disableAction] = useActionState(disableUserAction, INITIAL);

  const formatDate = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Sao_Paulo",
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(iso))
      : "nunca";

  return (
    <section className="flex flex-col gap-3">
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <div className="flex justify-end">
        <button onClick={() => setCreating(true)} className="min-h-11 text-sm text-sky-700 underline">
          Novo usuário
        </button>
      </div>

      {users.length === 0 ? (
        <EmptyState title="Nenhum usuário além de você." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">Usuários do restaurante</caption>
            <thead className="bg-slate-50 text-left">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Nome</th>
                <th scope="col" className="px-4 py-2 font-medium">Email</th>
                <th scope="col" className="px-4 py-2 font-medium">Papel</th>
                <th scope="col" className="px-4 py-2 font-medium">Situação</th>
                <th scope="col" className="px-4 py-2 font-medium">Último acesso</th>
                <th scope="col" className="px-4 py-2"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{u.name}</td>
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2">{ROLE_LABEL[u.role]}</td>
                  <td className="px-4 py-2">{u.status === "ACTIVE" ? "Ativo" : "Desativado"}</td>
                  <td className="px-4 py-2">{formatDate(u.lastLoginAt)}</td>
                  <td className="flex gap-2 px-4 py-2">
                    <button onClick={() => setEditing(u)} className="min-h-11 text-sky-700 underline">
                      Editar
                    </button>
                    {u.status === "ACTIVE" && u.id !== currentUserId && (
                      <form action={disableAction}>
                        <input type="hidden" name="id" value={u.id} />
                        <button type="submit" className="min-h-11 text-red-700 underline">
                          Desativar
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UserFormModal
        open={creating || editing !== null}
        user={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </section>
  );
}
```

`apps/web/src/app/(app)/usuarios/user-form-modal.tsx`:
```tsx
"use client";
import { useActionState } from "react";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Modal } from "@/components/modal";
import { createUserAction, updateUserAction, type FormState } from "./actions";

const INITIAL: FormState = {};

const ROLES = [
  { value: "MANAGER", label: "Gerente" },
  { value: "WAITER", label: "Garçom" },
  { value: "KITCHEN", label: "Cozinha" },
  { value: "CASHIER", label: "Caixa" },
  { value: "OWNER", label: "Dono" },
] as const;

type User = { id: string; name: string; email: string; role: string };

export function UserFormModal({
  open,
  user,
  onClose,
}: {
  open: boolean;
  user: User | null;
  onClose: () => void;
}) {
  const isEdit = user !== null;
  const [state, action] = useActionState(isEdit ? updateUserAction : createUserAction, INITIAL);

  if (state.ok && open) onClose();

  return (
    <Modal open={open} title={isEdit ? "Editar usuário" : "Novo usuário"} onClose={onClose}>
      <form key={user?.id ?? "new"} action={action} className="flex flex-col gap-4" noValidate>
        {state.error && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {state.error}
          </p>
        )}
        {isEdit && <input type="hidden" name="id" value={user.id} />}

        <Field name="name" label="Nome" required defaultValue={user?.name} error={state.fieldErrors?.name} />

        {!isEdit && (
          <>
            <Field name="email" label="Email" type="email" required error={state.fieldErrors?.email} />
            <Field
              name="password"
              label="Senha"
              type="password"
              required
              hint="No mínimo 12 caracteres."
              error={state.fieldErrors?.password}
              autoComplete="new-password"
            />
          </>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="role" className="text-sm font-medium text-slate-700">
            Papel
          </label>
          <select
            id="role"
            name="role"
            defaultValue={user?.role ?? "WAITER"}
            className="min-h-11 rounded-md border border-slate-300 px-3"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" pendingLabel="Salvando…">
          Salvar
        </Button>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `E2E_EMAIL=$EMAIL pnpm --filter @consusimples/web e2e -- users`
Expected: PASS, 4 testes.

- [ ] **Step 6: Rodar tudo**

Run: `pnpm turbo lint typecheck test build && pnpm --filter @consusimples/web e2e`
Expected: verde em todos os pacotes; 16 testes de e2e passando.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/\(app\)/usuarios apps/web/e2e/users.spec.ts
git commit -m "feat(web): user management screen with role editing and permission state"
```

---

### Task 7: Telas de recuperação de senha

**Files:**
- Create: `apps/web/src/app/(public)/esqueci-senha/page.tsx`, `apps/web/src/app/(public)/esqueci-senha/actions.ts`, `apps/web/src/app/(public)/esqueci-senha/forgot-form.tsx`, `apps/web/src/app/(public)/redefinir-senha/page.tsx`, `apps/web/src/app/(public)/redefinir-senha/actions.ts`, `apps/web/src/app/(public)/redefinir-senha/reset-form.tsx`
- Modify: `apps/web/src/app/(public)/entrar/page.tsx`
- Test: `apps/web/e2e/password-reset.spec.ts`

**Interfaces:**
- Consumes: `apiPublic` (Task 1), `forgotPasswordSchema`/`resetPasswordSchema` (Task 11 do plano da API)
- Produces:
  - `forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState>` — `FormState = { sent?: boolean; error?: string; fieldErrors?: Record<string, string> }`
  - `resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState>`
  - Rotas `/esqueci-senha` e `/redefinir-senha?token=…`

**Pré-requisito:** Task 11 do plano da API executada — `/auth/forgot-password` e `/auth/reset-password` precisam existir.

- [ ] **Step 1: Escrever o teste e2e (falha primeiro)**

`apps/web/e2e/password-reset.spec.ts`:
```ts
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
  await page.getByLabel("Email").fill("nao-existe-mesmo@bar.com");
  await page.getByRole("button", { name: "Enviar link" }).click();
  const unknown = await page.getByRole("status").textContent();

  // A tela não pode revelar se a conta existe.
  expect(known).toBe(unknown);
});

test("refuses an invalid reset token with a clear message", async ({ page }) => {
  await page.goto("/redefinir-senha?token=token-que-nao-existe");
  await page.getByLabel("Nova senha").fill("senha-nova-bem-longa");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.getByRole("alert")).toContainText(/inválido ou expirado/i);
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
  await expect(page.getByRole("alert")).toBeVisible();
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `E2E_EMAIL=$EMAIL pnpm --filter @consusimples/web e2e -- password-reset`
Expected: FAIL — `/esqueci-senha` responde 404.

- [ ] **Step 3: Implementar as actions**

`apps/web/src/app/(public)/esqueci-senha/actions.ts`:
```ts
"use server";
import { forgotPasswordSchema } from "@consusimples/validation";
import { apiPublic } from "@/lib/api";
import { messageFor } from "@/lib/errors";

export type FormState = { sent?: boolean; error?: string; fieldErrors?: Record<string, string> };

export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: { email: "Informe um email válido." } };

  try {
    await apiPublic("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
  } catch (e) {
    return { error: messageFor(e) };
  }

  // Mesma confirmação sempre: a API já responde 202 para email desconhecido,
  // e a tela não pode desfazer isso mostrando "não encontramos essa conta".
  return { sent: true };
}
```

`apps/web/src/app/(public)/redefinir-senha/actions.ts`:
```ts
"use server";
import { redirect } from "next/navigation";
import { resetPasswordSchema } from "@consusimples/validation";
import { apiPublic } from "@/lib/api";
import { messageFor } from "@/lib/errors";

export type FormState = { error?: string; fieldErrors?: Record<string, string> };

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] ??=
        issue.path[0] === "password"
          ? "A senha precisa ter pelo menos 12 caracteres."
          : "Link inválido ou expirado. Peça um novo.";
    }
    return { fieldErrors };
  }

  try {
    await apiPublic("/auth/reset-password", { method: "POST", body: JSON.stringify(parsed.data) });
  } catch (e) {
    return { error: messageFor(e) };
  }

  // redirect() lança: fora do try, senão o catch engole o controle de fluxo.
  redirect("/entrar?senha-redefinida=1");
}
```

- [ ] **Step 4: Implementar as telas**

`apps/web/src/app/(public)/esqueci-senha/forgot-form.tsx`:
```tsx
"use client";
import { useActionState } from "react";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { forgotPasswordAction, type FormState } from "./actions";

const INITIAL: FormState = {};

export function ForgotForm() {
  const [state, action] = useActionState(forgotPasswordAction, INITIAL);

  if (state.sent) {
    // role="status" (não "alert"): é confirmação, anunciada sem interromper.
    return (
      <p role="status" className="rounded-md bg-emerald-50 p-4 text-sm text-emerald-900">
        Se existir uma conta com esse email, enviamos um link para criar uma senha nova. O link vale
        por 1 hora.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <Field
        name="email"
        label="Email"
        type="email"
        required
        autoComplete="email"
        error={state.fieldErrors?.email}
      />
      <Button type="submit" pendingLabel="Enviando…">
        Enviar link
      </Button>
    </form>
  );
}
```

`apps/web/src/app/(public)/esqueci-senha/page.tsx`:
```tsx
import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export default function ForgotPasswordPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Esqueci minha senha</h1>
        <p className="mt-1 text-sm text-slate-600">
          Informe o email da conta e enviamos um link para criar uma senha nova.
        </p>
      </div>
      <ForgotForm />
      <Link href="/entrar" className="text-sm font-medium text-sky-700 underline">
        Voltar para o login
      </Link>
    </>
  );
}
```

`apps/web/src/app/(public)/redefinir-senha/reset-form.tsx`:
```tsx
"use client";
import { useActionState } from "react";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { resetPasswordAction, type FormState } from "./actions";

const INITIAL: FormState = {};

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {(state.error ?? state.fieldErrors?.token) && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {state.error ?? state.fieldErrors?.token}
        </p>
      )}
      {/* O token vai em campo oculto, não na action: assim o formulário reenvia
          sem depender da query string sobreviver ao POST. */}
      <input type="hidden" name="token" value={token} />
      <Field
        name="password"
        label="Nova senha"
        type="password"
        required
        hint="No mínimo 12 caracteres."
        autoComplete="new-password"
        error={state.fieldErrors?.password}
      />
      <Button type="submit" pendingLabel="Salvando…">
        Salvar nova senha
      </Button>
    </form>
  );
}
```

`apps/web/src/app/(public)/redefinir-senha/page.tsx`:
```tsx
import Link from "next/link";
import { ResetForm } from "./reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Link incompleto</h1>
        <p role="alert" className="text-sm text-slate-600">
          Este link não traz o código de verificação. Abra o link direto do email, sem copiar pela
          metade.
        </p>
        <Link href="/esqueci-senha" className="font-medium text-sky-700 underline">
          Pedir um novo link
        </Link>
      </div>
    );
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Criar nova senha</h1>
        <p className="mt-1 text-sm text-slate-600">
          Ao salvar, todas as sessões abertas nesta conta são encerradas.
        </p>
      </div>
      <ResetForm token={token} />
    </>
  );
}
```

- [ ] **Step 5: Ligar o link na tela de login**

Substituir o rodapé de `apps/web/src/app/(public)/entrar/page.tsx`:
```tsx
import Link from "next/link";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ "senha-redefinida"?: string }>;
}) {
  const params = await searchParams;

  return (
    <>
      <h1 className="text-2xl font-semibold">Entrar</h1>
      {params["senha-redefinida"] && (
        <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
          Senha alterada. Entre com a nova senha.
        </p>
      )}
      <LoginForm />
      <div className="flex flex-col gap-2 text-sm text-slate-600">
        <Link href="/esqueci-senha" className="font-medium text-sky-700 underline">
          Esqueci minha senha
        </Link>
        <span>
          Ainda não tem conta?{" "}
          <Link href="/cadastrar" className="font-medium text-sky-700 underline">
            Cadastrar restaurante
          </Link>
        </span>
      </div>
    </>
  );
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `E2E_EMAIL=$EMAIL pnpm --filter @consusimples/web e2e -- password-reset`
Expected: PASS, 6 testes.

- [ ] **Step 7: Rodar a suíte inteira**

Run: `pnpm turbo lint typecheck test build && E2E_EMAIL=$EMAIL pnpm --filter @consusimples/web e2e`
Expected: verde; 22 testes de e2e passando.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/\(public\) apps/web/e2e/password-reset.spec.ts
git commit -m "feat(web): password recovery screens with enumeration-safe confirmation"
```

---

## Checklist de tela (§19 do documento de UI/UX)

Rodar tela a tela antes de declarar o módulo pronto. Nenhuma tela é dada como pronta com item em branco.

```text
Para CADA tela (signup, confirme-email, verificar-email, login, esqueci-senha, redefinir-senha,
onboarding, cardápio, usuários):
[ ] Carregando — skeleton ou indicador, nunca tela em branco
[ ] Vazio — com ação, não frase morta
[ ] Erro — mensagem em pt-BR sem jargão, com caminho de saída
[ ] Sucesso — o resultado aparece sem exigir reload manual
[ ] Sem permissão — explica quem pode e o que fazer, não redireciona em silêncio
[ ] 1280×720 sem scroll horizontal e sem conteúdo cortado na altura
[ ] 1366×768 idem
[ ] 360×740 nas telas públicas (login, cadastro, recuperação)
[ ] Navegável só pelo teclado: Tab alcança tudo, Enter envia, Esc fecha modal
[ ] Foco visível em todo elemento focável
[ ] Erro de campo ligado ao input por aria-describedby e anunciado com role="alert"
[ ] Alvo de toque com pelo menos 44px de altura
[ ] Contraste AA em texto e em estado desabilitado
[ ] Nenhum dado sensível no HTML: sem token, sem hash, sem id interno desnecessário
```

## Definition of Done

- `pnpm turbo lint typecheck test build` verde.
- `pnpm --filter @consusimples/web e2e` verde.
- Nenhum `localStorage`/`sessionStorage` guardando token — provado pelo teste de `auth.spec.ts`.
- Todo módulo que lê cookie ou chama a API tem `import "server-only"` no topo.
- CSP subiu como `Report-Only`, relatório coletado e limpo antes de promover para `Content-Security-Policy`.
- Checklist de tela acima preenchido, item por item, para as nove telas.
