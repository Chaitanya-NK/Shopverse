#!/usr/bin/env bash
# Back up Shopverse's data (not its structure: that's the migrations in git).
#
#   DATABASE_URL=postgresql://... scripts/backup/backup-db.sh [out-dir]
#
# Use the *session pooler* or direct connection string from Supabase
# (Project settings -> Database), with the database password. Writes
#   <out-dir>/shopverse-<UTC time>.tar         the backup (data only)
#   <out-dir>/shopverse-<UTC time>.counts.txt  row counts, to check a restore
# Set BACKUP_PASSPHRASE to encrypt it (AES-256, .tar.enc); keep the
# passphrase somewhere other than the backups.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the database connection string}"
OUT_DIR="${1:-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASE="$OUT_DIR/shopverse-$STAMP"
mkdir -p "$OUT_DIR"

# One archive with: our schemas (app.dump), Supabase Auth's users so people
# keep their accounts (auth.dump; pg_dump ignores --schema when --table is
# given, hence two dumps) and exact row counts to check a restore against.
# Storage files are backed up separately (backup-storage.mjs).
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pg_dump "$DATABASE_URL" \
  --format=custom --compress=9 --data-only --no-owner --no-privileges \
  --schema=public --schema=private \
  --file="$WORK/app.dump"
pg_dump "$DATABASE_URL" \
  --format=custom --compress=9 --data-only --no-owner --no-privileges \
  --table=auth.users --table=auth.identities \
  --file="$WORK/auth.dump"

psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "
  select schemaname || '.' || relname || ' ' || (xpath('/row/c/text()',
    query_to_xml(format('select count(*) as c from %I.%I', schemaname, relname), false, true, '')))[1]::text
  from pg_stat_user_tables
  where schemaname in ('public', 'private') or (schemaname = 'auth' and relname in ('users', 'identities'))
  order by 1" > "$WORK/counts.txt"

tar -C "$WORK" -cf "$BASE.tar" app.dump auth.dump counts.txt
cp "$WORK/counts.txt" "$BASE.counts.txt"

if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
    -in "$BASE.tar" -out "$BASE.tar.enc" -pass env:BACKUP_PASSPHRASE
  rm "$BASE.tar"
  echo "Encrypted backup: $BASE.tar.enc"
else
  echo "Backup: $BASE.tar"
fi
echo "Row counts: $BASE.counts.txt"
