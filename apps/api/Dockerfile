FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# Manifests do workspace inteiro: com um package.json faltando, o pnpm recusa --frozen-lockfile.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/validation/package.json packages/validation/

FROM manifests AS deps
RUN pnpm install --frozen-lockfile --filter @consusimples/api...

# node_modules que vai para a imagem final: só dependência de produção, instalada limpa.
# `pnpm prune --prod` aqui não serve — em pnpm 11 ele apaga e refaz o node_modules inteiro.
FROM manifests AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter @consusimples/api...
COPY apps/api/prisma apps/api/prisma
# Prisma Client gerado DENTRO do alpine: o engine é musl, não serve o baixado no macOS/glibc.
RUN pnpm --filter @consusimples/api exec prisma generate

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/validation/node_modules ./packages/validation/node_modules
COPY . .
RUN pnpm --filter @consusimples/validation build \
 && pnpm --filter @consusimples/api exec prisma generate \
 && pnpm --filter @consusimples/api build

FROM base AS runtime
ENV NODE_ENV=production
# Identidade do que roda é o commit. O código só conhece APP_VERSION, nunca GIT_SHA.
ARG GIT_SHA=dev
ENV APP_VERSION=$GIT_SHA
# Heap abaixo do limite de memória do compose: o container morre por OOM antes do Node coletar.
ENV NODE_OPTIONS=--max-old-space-size=384

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps /app/packages/validation/node_modules ./packages/validation/node_modules
# package.json de cada workspace: é por ele que o require resolve o symlink @consusimples/validation.
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=prod-deps /app/apps/api/package.json ./apps/api/package.json
COPY --from=prod-deps /app/packages/validation/package.json ./packages/validation/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/packages/validation/dist ./packages/validation/dist

# node:alpine já traz o usuário `node` (uid 1000). Nunca rodar como root.
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]
