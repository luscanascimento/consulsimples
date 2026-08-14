#!/usr/bin/env bash
set -euo pipefail

# Backup que mora no mesmo disco não é backup: o dump sai cifrado e vai para storage off-site.
#
# Variáveis vêm do ambiente do servidor (o cron carrega /opt/consusimples/.env.backup):
#   POSTGRES_USER, POSTGRES_DB   — mesmas do docker-compose.prod.yml
#   BACKUP_PASSPHRASE            — chave simétrica do gpg, guardada FORA da VPS também
#   BACKUP_REMOTE                — destino rclone fora da VPS (ex.: b2:consusimples-backup)
#   COMPOSE_FILE                 — opcional, default docker-compose.prod.yml no diretório do projeto
: "${POSTGRES_USER:?}" "${POSTGRES_DB:?}" "${BACKUP_PASSPHRASE:?}" "${BACKUP_REMOTE:?}"

cd "$(dirname "$0")/.."
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="/tmp/consusimples-${STAMP}.sql.gz.gpg"
trap 'rm -f "$FILE"' EXIT

# O Postgres não publica porta na VPS (só a rede do compose o alcança), então o pg_dump
# roda dentro do container. `set -o pipefail` garante que dump quebrado não vire backup vazio.
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump --format=plain --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  | gzip -9 \
  | gpg --batch --symmetric --cipher-algo AES256 --passphrase "$BACKUP_PASSPHRASE" -o "$FILE"

# Arquivo vazio ou minúsculo = dump que falhou depois do pipe: não sobe e falha alto.
SIZE="$(wc -c <"$FILE")"
[ "$SIZE" -gt 1024 ] || { echo "backup ${STAMP} suspeito: ${SIZE} bytes" >&2; exit 1; }

rclone copy "$FILE" "$BACKUP_REMOTE"

echo "backup ${STAMP} (${SIZE} bytes) enviado para ${BACKUP_REMOTE}"
