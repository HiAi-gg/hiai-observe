#!/usr/bin/env bash
# Backup script for hiai_observe PostgreSQL database.
# Usage: ./scripts/backup.sh
# Cron:  0 2 * * * /app/scripts/backup.sh

set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://observe:observe@localhost:5432/hiai_observe}"
BACKUP_DIR="${BACKUP_DIR:-$(dirname "$0")/../backups}"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M")
FILENAME="hiai_observe_${TIMESTAMP}.sql.gz"
KEEP=${BACKUP_KEEP:-7}

mkdir -p "$BACKUP_DIR"

echo "[backup] Dumping database to ${BACKUP_DIR}/${FILENAME}..."
pg_dump "$DB_URL" | gzip > "${BACKUP_DIR}/${FILENAME}"

echo "[backup] Rotating: keeping last ${KEEP} backups..."
# shellcheck disable=SC2012
ls -1t "${BACKUP_DIR}"/hiai_observe_*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm --

echo "[backup] Done. $(ls -1 "${BACKUP_DIR}"/hiai_observe_*.sql.gz 2>/dev/null | wc -l) backup(s) on disk."
