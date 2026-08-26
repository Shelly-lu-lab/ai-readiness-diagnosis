#!/usr/bin/env sh
set -eu

backup_file="${1:-}"
if [ -z "$backup_file" ] || [ ! -f "$backup_file" ]; then
  echo "Usage: $0 /absolute/path/to/backup.dump" >&2
  exit 1
fi

checksum_file="${backup_file}.sha256"
if [ ! -f "$checksum_file" ]; then
  echo "Checksum file missing: $checksum_file" >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum -c "$checksum_file"
else
  shasum -a 256 -c "$checksum_file"
fi
pg_restore --list "$backup_file" >/dev/null
echo "Backup checksum and archive structure are valid."
