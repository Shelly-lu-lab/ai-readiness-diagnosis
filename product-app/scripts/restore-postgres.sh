#!/usr/bin/env sh
set -eu

backup_file="${1:-}"
if [ -z "$backup_file" ] || [ ! -f "$backup_file" ]; then
  echo "Usage: $0 /absolute/path/to/backup.dump" >&2
  exit 1
fi
if [ -z "${RESTORE_DATABASE_URL:-}" ]; then
  echo "RESTORE_DATABASE_URL is required" >&2
  exit 1
fi
if [ "${ALLOW_DATABASE_RESTORE:-}" != "YES" ]; then
  echo "Set ALLOW_DATABASE_RESTORE=YES after confirming the exact restore target." >&2
  exit 1
fi

"$(dirname "$0")/verify-postgres-backup.sh" "$backup_file"
pg_restore \
  --dbname="$RESTORE_DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --exit-on-error \
  "$backup_file"

psql "$RESTORE_DATABASE_URL" \
  --no-psqlrc \
  --tuples-only \
  --command="SELECT 'tenants=' || count(*) FROM tenants; SELECT 'campaigns=' || count(*) FROM campaigns; SELECT 'reports=' || count(*) FROM report_snapshots;"
