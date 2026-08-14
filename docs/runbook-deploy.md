# Runbook — deploy da API na VPS do cliente

Ambiente: VPS do cliente, fora do Proxmox. Um proxy (Caddy/Traefik) na frente termina o TLS.
Sem Dokploy, sem CT 100, sem `dokploy-network`. Só `docker compose` no diretório do projeto
(`/opt/consusimples`).

A imagem é a mesma para os três papéis: `migrate` (roda e sai), `api` (fica de pé) e o `postgres`
oficial ao lado. Só a porta `127.0.0.1:3001` é publicada — quem fala com a internet é o proxy.

## Primeiro deploy

1. `cp .env.example .env` no servidor e preencher **todos** os valores, inclusive o bloco
   comentado do fim (`POSTGRES_*`, `DATABASE_URL` apontando para o host `postgres`).
   Segredos com 32+ caracteres gerados por `openssl rand -base64 48`. O `.env` fica só no
   servidor, `chmod 600`, nunca no git.
2. Medir os proxies antes de fixar `TRUST_PROXY_HOPS` (ver "Conferir o trust proxy" abaixo).
3. `export GIT_SHA=$(git rev-parse --short HEAD)` e gravar a mesma linha no `.env`
   (`GIT_SHA=<sha>`): o compose lê o `.env` para interpolar `${GIT_SHA}`, então qualquer
   `docker compose ps/logs` posterior encontra a imagem certa sem depender do shell aberto.
4. `docker build -f apps/api/Dockerfile --build-arg GIT_SHA=$GIT_SHA -t consusimples-api:$GIT_SHA .`
5. `docker compose -f docker-compose.prod.yml up -d`
6. `curl -s localhost:3001/health/ready` deve responder `{"status":"ok"}`, e
   `curl -s localhost:3001/health/live` deve trazer `"version":"<GIT_SHA>"` — é assim que se
   confirma qual commit está no ar.
7. Agendar o backup: `0 3 * * * /opt/consusimples/scripts/backup-db.sh >> /var/log/consusimples-backup.log 2>&1`
   no cron do servidor, com `POSTGRES_USER`, `POSTGRES_DB`, `BACKUP_PASSPHRASE` e `BACKUP_REMOTE`
   no ambiente do cron.
8. **Testar o restore** do primeiro backup num banco descartável. Backup nunca restaurado não conta.

## Conferir o trust proxy

`TRUST_PROXY_HOPS` é o número de proxies **nossos** na frente da API. Com um Caddy/Traefik só,
é `1` — mas isso se confirma medindo, não supondo: se o número for alto demais, o cliente
escolhe o próprio IP no `X-Forwarded-For` e escapa do rate limit; se for baixo demais, todo
mundo vira o IP do proxy e um cliente derruba o rate limit dos outros.

De outra máquina (fora da VPS), com a API já no ar atrás do proxy:

```bash
curl -s https://api.dominio/health/live            # sem forjar nada
curl -s -H 'X-Forwarded-For: 1.2.3.4' https://api.dominio/health/live   # forjando
```

Na VPS, ler o que a API recebeu — o log de request já traz o header cru:

```bash
docker compose -f docker-compose.prod.yml logs api | grep x-forwarded-for | tail -2
```

- Primeira chamada: o `req.headers["x-forwarded-for"]` registrado tem **N** entradas. Esse N é o
  `TRUST_PROXY_HOPS` — com um Caddy/Traefik só, uma entrada (o IP real do cliente) → `1`.
- Segunda chamada: o header chega como `1.2.3.4, <ip-real-do-cliente>`. Com `TRUST_PROXY_HOPS=1`
  o Express descarta a entrada mais à direita como sendo do proxy e usa o IP real. Se o valor
  usado pela aplicação virar `1.2.3.4`, o número está alto demais.

O IP que a aplicação **de fato** usou aparece no log de login falho, campo `ip`:

```bash
curl -s -H 'X-Forwarded-For: 1.2.3.4' -H 'Content-Type: application/json' \
  -d '{"email":"medida@teste.com","password":"senhaerrada123"}' https://api.dominio/auth/login
docker compose -f docker-compose.prod.yml logs api | grep login_failed | tail -1
```

Esse `ip` é o mesmo que alimenta o rate limit. Tem que ser o IP real do cliente, nunca `1.2.3.4`.
Confirmar do outro lado também: repetir o login errado 6 vezes da mesma máquina forjando um
`X-Forwarded-For` diferente a cada tentativa — a sexta tem que responder `429`. Se as seis
passarem, `TRUST_PROXY_HOPS` está alto demais: corrigir no `.env` e
`docker compose -f docker-compose.prod.yml up -d api`.

Nenhuma rota de debug é necessária para isso, e nenhuma deve ser criada: a medida sai do log que
já existe.

Se um dia entrar um segundo proxy (CDN na frente do Caddy), o número muda para `2`. Refazer a
medida a cada mudança de topologia de rede.

## Deploy seguinte

Mesmos passos 3–6. A migration roda no serviço `migrate`, que precisa terminar com sucesso antes
da `api` subir; se ela falhar, a API antiga continua no ar e o `docker compose up` para ali.
A imagem antiga fica no disco: é o rollback.

## Rollback

```bash
GIT_SHA=<sha-anterior> docker compose -f docker-compose.prod.yml up -d api
```

Migration **não** volta sozinha. Se o deploy incluiu migration destrutiva, o rollback exige restore
do backup — por isso migration destrutiva só entra por expand/contract, em deploys separados.

## Restore

```bash
gpg --batch --decrypt --passphrase "$BACKUP_PASSPHRASE" consusimples-<stamp>.sql.gz.gpg \
  | gunzip \
  | docker compose -f docker-compose.prod.yml exec -T postgres psql -U "$POSTGRES_USER" -d restore_teste
```

Restaurar sempre num banco descartável primeiro (`createdb restore_teste`), conferir contagem de
linhas de `tenants` e `users`, e só então decidir sobre o banco de produção.

## Observabilidade no dia a dia

- `docker compose -f docker-compose.prod.yml logs -f api` — log estruturado JSON, com `service`,
  `version` (o commit) e `correlationId` em cada linha. Para rastrear uma reclamação de cliente,
  procurar pelo `correlationId` que a resposta de erro devolveu.
- `docker inspect --format '{{.State.Health.Status}}' $(docker compose -f docker-compose.prod.yml ps -q api)`
  — o healthcheck bate em `/health/ready`, que só responde `ok` com o banco respondendo.
- Log rotacionado em 10 MB × 5 arquivos por container; a API tem teto de 512 MB de memória
  (heap do Node em 384 MB, abaixo do teto, para o GC agir antes do OOM killer).

## O que nunca fazer sozinho neste servidor

Parar o banco, apagar volume, rodar `prisma migrate reset`, editar `.env` sem avisar, ou aplicar
migration destrutiva. Tudo isso pede confirmação explícita do responsável.
