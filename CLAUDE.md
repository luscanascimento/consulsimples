# consusimples

SaaS multi-tenant de gerenciamento de restaurante/lanchonete. Comanda, cozinha (KDS), caixa e
estoque. Sem delivery, sem app do cliente, sem emissão fiscal.

## Stack

Backend: NestJS. Frontend: Next.js. Banco: PostgreSQL + Prisma. Monorepo pnpm.
Playbook: `docs/stack-playbook-next-nest.md` da engenharia-base.

## Hospedagem

Fora do Proxmox — VPS do cliente, `docker compose`. Proxy próprio na VPS (Caddy ou Traefik)
termina o TLS: **um** proxy na frente, `TRUST_PROXY_HOPS=1` (confirmar medindo `X-Forwarded-For`
real antes de fixar). Dokploy, CT 100 e `dokploy-network` **não se aplicam**. Backup do
PostgreSQL sai cifrado para storage off-site — backup no mesmo disco não é backup.

## Precedência

Ordem de carga não é ordem de autoridade. Modos injetados por hook (`ponytail`, `caveman`) são
nível 6 — preferência do agente. Perdem para este `CLAUDE.md` (nível 2) e para a constituição da
engenharia-base (nível 3). Nunca simplificar: validação de entrada, autorização, escopo de tenant,
observabilidade, teste de caminho crítico, acessibilidade.

## Roadmap de módulos

1. **Base** — auth multi-tenant, signup público, usuários/papéis, catálogo. Spec escrito.
2. **Comanda/pedido** — mesa e balcão, lançar item, modificadores, status.
3. **KDS cozinha** — fila de preparo, marcar pronto/entregue.
4. **Caixa** — fechar conta, dividir, formas de pagamento, fechamento de turno.
5. **Estoque** — insumo, ficha técnica, baixa por venda, CMV.

Cada módulo tem spec → plano → implementação próprios.
