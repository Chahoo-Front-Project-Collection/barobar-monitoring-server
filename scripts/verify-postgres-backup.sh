#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 /path/to/backup.dump" >&2
  exit 2
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: ${BACKUP_FILE}" >&2
  exit 2
fi

cd "$APP_DIR"

docker compose -f "$COMPOSE_FILE" exec -T postgres pg_restore --list \
  < "$BACKUP_FILE" \
  > /dev/null

echo "Backup is readable by pg_restore: ${BACKUP_FILE}"
