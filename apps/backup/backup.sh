#!/bin/sh
set -eu
set -o pipefail

: "${PGHOST:=postgres}"
: "${PGPORT:=5432}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${AGE_RECIPIENT:?AGE_RECIPIENT is required}"
: "${BACKUP_REMOTE:?BACKUP_REMOTE is required}"

case "$AGE_RECIPIENT" in
  age1*) ;;
  *) echo "AGE_RECIPIENT must be an age X25519 public recipient." >&2; exit 2 ;;
esac
case "$BACKUP_REMOTE" in
  *:*) ;;
  *) echo "BACKUP_REMOTE must name a configured rclone remote, not a local path." >&2; exit 2 ;;
esac

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
object="${BACKUP_REMOTE%/}/serveos-${timestamp}-$(head -c 8 /dev/urandom | od -An -tx1 | tr -d ' \n').dump.age"
export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD

echo "Starting encrypted ServOS database backup to configured off-VPS remote."
pg_dump --no-password --format=custom --compress=6 |
  age --encrypt --recipient "$AGE_RECIPIENT" |
  rclone rcat --retries 3 --low-level-retries 10 "$object"

metadata=$(rclone lsjson --stat "$object")
bytes=$(printf '%s' "$metadata" | jq -er '.Size | select(. > 0)')
printf '{"event":"backup_uploaded","object":"%s","encryptedBytes":%s,"timestamp":"%s"}\n' "$object" "$bytes" "$timestamp"
