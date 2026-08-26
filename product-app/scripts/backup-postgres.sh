#!/usr/bin/env sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

backup_root="${BACKUP_DIRECTORY:-./backups/postgres}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="${backup_root}/ai-readiness-${timestamp}.dump"

mkdir -p "$backup_root"
umask 077
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$backup_file"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$backup_file" > "${backup_file}.sha256"
else
  shasum -a 256 "$backup_file" > "${backup_file}.sha256"
fi
echo "$backup_file"
