#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/barobar-monitoring}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-5}"
BACKUP_PREFIX="${BACKUP_PREFIX:-barobar_monitoring}"

timestamp="$(date +%Y%m%d_%H%M%S)"
backup_file="${BACKUP_DIR}/${BACKUP_PREFIX}_${timestamp}.dump"

mkdir -p "$BACKUP_DIR"
umask 077

cd "$APP_DIR"

docker compose -f "$COMPOSE_FILE" exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' \
  > "$backup_file"

find "$BACKUP_DIR" \
  -type f \
  -name "${BACKUP_PREFIX}_*.dump" \
  -mtime +"$BACKUP_RETENTION_DAYS" \
  -delete

ln -sfn "$backup_file" "${BACKUP_DIR}/${BACKUP_PREFIX}_latest.dump"

echo "Created PostgreSQL backup: ${backup_file}"
