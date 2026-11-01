#!/usr/bin/env bash
# Restore a backup made by backup-db.sh into a database that has Shopverse's
# structure but no data: a new Supabase project after `npx supabase db push`
# (or `supabase db reset` locally). See docs/RUNBOOK.md before using it.
#
#   DATABASE_URL=postgresql://... scripts/backup/restore-db.sh backups/shopverse-<time>.tar[.enc]
#
# Encrypted backups need BACKUP_PASSPHRASE. Refuses to run on a database that
# already has businesses in it unless FORCE=1.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the target database connection string}"
FILE="${1:?Give the backup file}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [[ "$FILE" == *.enc ]]; then
  : "${BACKUP_PASSPHRASE:?This backup is encrypted: set BACKUP_PASSPHRASE}"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$FILE" -out "$WORK/backup.tar" -pass env:BACKUP_PASSPHRASE
  FILE="$WORK/backup.tar"
fi
tar -C "$WORK" -xf "$FILE" app.dump auth.dump counts.txt

EXISTING="$(psql "$DATABASE_URL" -X -A -t -c "select count(*) from public.organizations")"
if [ "$EXISTING" != "0" ] && [ "${FORCE:-}" != "1" ]; then
  echo "The target already has $EXISTING businesses. Restore into an empty database, or set FORCE=1." >&2
  exit 1
fi

# Data only, in one transaction. Replica mode skips triggers and foreign-key
# checks while loading (tables load in any order, nothing is re-audited);
# the data was consistent when it was dumped.
pg_restore --data-only --no-owner --no-privileges -f "$WORK/auth.sql" "$WORK/auth.dump"
pg_restore --data-only --no-owner --no-privileges -f "$WORK/app.sql" "$WORK/app.dump"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction -q \
  -c "set session_replication_role = replica" -f "$WORK/auth.sql" -f "$WORK/app.sql" >/dev/null

# Identity columns and sequences continue after the restored rows.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -c "
  do \$\$
  declare r record;
  begin
    for r in
      select s.relname as seq, t.relname as tab, a.attname as col, n.nspname as sch
      from pg_class s
      join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
      join pg_class t on t.oid = d.refobjid
      join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
      join pg_namespace n on n.oid = t.relnamespace
      where s.relkind = 'S' and n.nspname in ('public', 'private')
    loop
      execute format('select setval(%L, coalesce((select max(%I) from %I.%I), 0) + 1, false)',
                     r.sch || '.' || r.seq, r.col, r.sch, r.tab);
    end loop;
  end \$\$;"

psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "
  select schemaname || '.' || relname || ' ' || (xpath('/row/c/text()',
    query_to_xml(format('select count(*) as c from %I.%I', schemaname, relname), false, true, '')))[1]::text
  from pg_stat_user_tables
  where schemaname in ('public', 'private') or (schemaname = 'auth' and relname in ('users', 'identities'))
  order by 1" > "$WORK/after.txt"

if diff -q "$WORK/counts.txt" "$WORK/after.txt" >/dev/null; then
  echo "Restored. Every table has the same number of rows as when it was backed up."
else
  echo "Restored, but some row counts differ from the backup:" >&2
  diff "$WORK/counts.txt" "$WORK/after.txt" >&2 || true
  exit 2
fi
