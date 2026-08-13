# consusimples — Módulo 1: Base

**Data:** 2026-08-13
**Status:** aprovado, pronto para plano de implementação

## Contexto

SaaS multi-tenant de gerenciamento de restaurante/lanchonete. O produto completo tem quatro
frentes — comanda/pedido, cozinha (KDS), caixa/PDV e estoque — construídas em cinco módulos
sequenciais. Este documento especifica apenas o **Módulo 1: Base**, do qual todos os outros
dependem.

### Decisões de escopo do produto

| Tema | Decisão |
|---|---|
| Modelo de negócio | SaaS multi-tenant. Tenant = restaurante. |
| Delivery / app do cliente | **Fora.** |
| Emissão fiscal (NFC-e, SAT) | **Fora.** Nem agora nem preparado no modelo. |
| Conectividade | Online sempre. Rede caiu, para. Sem offline-first. |
| Impressão | Só a conta do cliente, via diálogo de impressão do navegador (HTML/PDF). Sem ESC/POS, sem agente local. |
| Entrada de clientes | Signup público self-service. **Sem billing** nesta fase. |
| Dispositivos | Garçom no celular (360×740, módulo 2+). Cozinha e caixa em desktop (1280×720, 1366×768). |

### Roadmap de módulos

1. **Base** — auth multi-tenant, signup, usuários/papéis, catálogo. *(este documento)*
2. **Comanda/pedido** — abrir mesa ou balcão, lançar item, modificadores, observação, status.
3. **KDS cozinha** — fila de preparo em tela, marcar pronto/entregue.
4. **Caixa** — fechar conta, dividir, formas de pagamento, sangria, fechamento de turno.
5. **Estoque** — insumo, ficha técnica do prato, baixa automática na venda, CMV.

Cada módulo terá spec, plano e ciclo de implementação próprios.

---

## 1. Arquitetura

Monorepo pnpm workspaces:

```
apps/api                NestJS + Prisma + PostgreSQL
apps/web                Next.js App Router (BFF)
packages/validation     schemas zod — fonte única entre back e front
```

Sem `packages/ui` nesta fase: componente nasce em `apps/web` e sobe para package no terceiro uso.
Sem Redis, sem fila, sem microserviço — nenhum tem evidência de necessidade.

### Fluxo de request

```
browser → Next.js (route handler / server action) → API NestJS
```

O cookie `HttpOnly` vive no servidor do Next. **O browser nunca guarda access token.** O Next
repassa ao Nest com `Authorization: Bearer`.

### Camadas no NestJS

Por módulo de domínio (`auth`, `tenant`, `catalog`):

- **controller** — HTTP, validação zod, resposta em DTO. Não conhece Prisma.
- **service** — regra de negócio. Não conhece HTTP.
- **repository** — única camada que toca Prisma. `tenantId` é injetado **aqui**.

### Isolamento de tenant

**Abordagem escolhida: `tenantId` em toda tabela + filtro forçado no repository.**

Uma Prisma client extension injeta `where: { tenantId }` e `data: { tenantId }` em toda query. O
tenant vem de um `TenantContext` em `AsyncLocalStorage`, preenchido pelo guard de auth.

**O service não recebe `tenantId` como parâmetro.** Se recebesse, um dia alguém passaria o errado.

Alternativas descartadas:

- **RLS do PostgreSQL** — isolamento mais forte (resiste até a query crua), mas exige `SET
  app.tenant_id` por transação, o que briga com o pool do Prisma; piora debug e migration. O dado
  aqui é cardápio e comanda, não dado regulado. Continua sendo upgrade possível depois: as colunas
  já estarão no lugar.
- **Schema por tenant** — N migrations, backup por schema, dor operacional que só paga em cliente
  enterprise com exigência contratual de isolamento físico.

**Mitigação do furo conhecido:** `$queryRaw` e `$executeRaw` proibidos por regra de lint fora de
`**/raw/*.ts`. Arquivo em `raw/` exige revisão humana no PR. O teste de vazamento entre tenants é
gate de CI.

---

## 2. Modelo de dados

Cinco tabelas. `tenantId` em todas menos `Tenant`, sempre a **primeira coluna** do índice composto.

```prisma
Tenant        id(uuidv7)  name  slug@unique  status  createdAt
User          id  tenantId  email@unique  passwordHash  name  role  status  lastLoginAt
Category      id  tenantId  name  sortOrder  active
Product       id  tenantId  categoryId  name  description  priceCents  available  sortOrder
RefreshToken  id  userId  tokenHash  expiresAt  revokedAt  familyId
```

### Decisões

- **`email` único global**, não por tenant. Login é email+senha, sem pedir o slug do restaurante.
  Custo aceito: a mesma pessoa não gerencia dois restaurantes com o mesmo email. Reversível depois
  com uma tabela `Membership`; não pagamos essa complexidade hoje.
- **`priceCents Int`** — centavos inteiros, nunca float. Registrar em ADR.
- **`role` enum**: `OWNER`, `MANAGER`, `WAITER`, `KITCHEN`, `CASHIER`. Enum no banco, não tabela de
  permissões. RBAC granular só quando um cliente pedir.
- **Nada é deletado.** `active` / `available` em vez de `DELETE`. Produto vendido não pode sumir do
  histórico do módulo 2.
- **Preço é mutável** no produto. O pedido (módulo 2) copia o preço no item — histórico correto sem
  versionar produto.
- **IDs públicos UUIDv7** (não enumeráveis). O ID nunca substitui autorização.

### Deliberadamente fora do módulo 1

- Modificadores e adicionais (sem cebola, ponto da carne) → módulo 2, junto da comanda, onde a
  necessidade fica concreta.
- Ficha técnica e custo → módulo 5.

---

## 3. Auth, signup e autorização

Signup público é superfície de ataque aberta na internet. Nada aqui é simplificado.

### Signup

`POST /auth/signup` com `{ restaurantName, ownerName, email, password }` cria `Tenant` +
`User(OWNER)` **numa única transação**.

O tenant nasce em `PENDING_VERIFICATION`. Email de confirmação com token de uso único, validade
24h. Sem verificar, não loga. Sem esse passo, signup público sem billing vira fábrica de
tenant-lixo — não há atrito nenhum segurando.

**Única dependência nova do módulo:** provedor de email transacional (Resend).

### Sessão

- Access token JWT, 15 minutos.
- Refresh token opaco, 30 dias, **hash no banco**, rotação a cada uso.
- **Detecção de reuso:** refresh usado duas vezes revoga a família inteira (`familyId`) e força
  login novo.
- Cookie no Next: `HttpOnly`, `Secure`, `SameSite=Lax`.

### Senha

argon2id, mínimo 12 caracteres. Resposta de login inválido **sempre idêntica** — mesma mensagem,
mesmo tempo de resposta, sem revelar se o email existe.

### Rate limit

| Rota | Limite |
|---|---|
| Login | 5/min por IP+email |
| Signup | 3/h por IP |
| Recuperação de senha | 3/h por IP |

Chave de IP respeitando `TRUST_PROXY_HOPS`. **O valor é do ambiente real do cliente — medir, não
copiar de outro projeto.**

### Autorização — duas camadas independentes

1. **Guard de papel na rota.** `@Roles(OWNER, MANAGER)` para editar catálogo e usuários; garçom só
   lê.
2. **`tenantId` no repository.** Pedir o ID de um produto de outro tenant devolve **404, não 403** —
   403 confirmaria que o recurso existe.

### Configuração

Schema zod validado no boot. Variável faltando derruba o processo na largada, não no primeiro
request. `process.env` cru só em tracing, logger e entrypoint.

### Erros

Erro de validação: código `VALIDATION_001`, HTTP 422. Formato de erro único em toda a API.

---

## 4. Telas

Módulo 1 é tela de dono e gerente: **desktop-first, 1280×720 e 1366×768** — largura **e** altura.
Exceção: **login e recuperação de senha responsivos até 360×740**, porque o garçom entra pelo
celular já no módulo 2.

### Públicas

Signup · "confirme seu email" · confirmação de email · esqueci senha · redefinir senha · login.

### Autenticadas (shell com navegação lateral)

- **Onboarding** pós-verificação: nome do restaurante, fuso horário. Um passo só.
- **Catálogo** — categorias e produtos na mesma tela: coluna de categorias à esquerda, produtos da
  categoria selecionada à direita. Criar/editar produto em modal (nome, descrição, preço,
  categoria, disponível). Reordenação por drag ou campo de ordem.
- **Usuários** — lista, criar usuário com papel, desativar. Visível só para `OWNER` e `MANAGER`.

### Obrigatório em toda tela que busca dado

Os cinco estados: **carregando, vazio, erro, sucesso, sem permissão.** Estado vazio traz ação
("nenhum produto ainda — criar o primeiro"), não frase morta.

### Acessibilidade

Foco visível, formulário navegável por teclado, erro de campo ligado ao input por
`aria-describedby`, contraste AA. Baseline, não enfeite.

O acabamento visual usa a skill `frontend-design` na implementação; o produto (hierarquia, estados,
responsividade, acessibilidade) segue o documento de UI/UX da engenharia-base — em conflito, vence
o documento.

---

## 5. Testes

Módulo de auth e multi-tenancy: unit + integration + e2e, sem isenção.

- **Unit** — validação de senha, rotação de refresh, resolução de permissão.
- **Integration** com PostgreSQL real (testcontainers) — repository, transação de signup,
  unicidade de email.
- **E2E de vazamento entre tenants** — cria dois tenants, tenta ler, editar e deletar recurso do
  outro por ID direto, espera 404 em todos. **Gate de CI: falhou, não mergeia.**
- **E2E de auth** — login, refresh, reuso de refresh revogando a família, rate limit disparando.

---

## 6. Observabilidade

Acompanha a feature; não entra depois.

- Log JSON estruturado (pino). Correlation ID gerado no Next e propagado ao Nest em toda chamada.
- **Nunca no log:** senha, token, hash, cookie. Email mascarado.
- **Log de auditoria** com ator, tenant e antes/depois em: login, login falho, criação e
  desativação de usuário, mudança de papel, mudança de preço.
- `/health/live` (liveness) e `/health/ready` (readiness — checa o banco).

---

## 7. Deploy

**Ambiente: VPS do cliente, `docker compose`. Fora do Proxmox** — Dokploy, CT 100 e
`dokploy-network` não se aplicam.

- Dockerfile multi-stage, usuário non-root, healthcheck.
- Limite de memória no compose, heap do Node abaixo dele.
- Rotação de log configurada.
- **Migration como passo separado do start**, nunca no entrypoint da aplicação.
- Backup do PostgreSQL desde o dia 1: `pg_dump` cifrado para storage **off-site**. Backup no mesmo
  disco não é backup.
- Rollback ensaiado antes do primeiro deploy real.
- Identidade do que roda = commit SHA (`ARG GIT_SHA` → `ENV APP_VERSION`).
- Proxy próprio na VPS (Caddy ou Traefik) termina o TLS: **um** proxy → `TRUST_PROXY_HOPS=1`,
  confirmado medindo `X-Forwarded-For` real.

### Risco registrado (não técnico)

Rodar na VPS do cliente exige acordo escrito sobre quem tem root, quem reinicia fora do horário
comercial e o que acontece se o cliente alterar a máquina. Fora do escopo de código, dentro do
escopo de risco do projeto.

---

## Fora de escopo — registro explícito

Delivery · app do cliente · emissão fiscal · offline-first · impressão ESC/POS · billing e
assinatura · RBAC granular · modificadores de produto · ficha técnica · multi-unidade por tenant ·
mesma pessoa em vários restaurantes.
