#!/bin/sh
set -eu
set -o pipefail
umask 077

# This is a local recovery rehearsal for a pre-created, empty disposable database.
# It does not use BACKUP_REMOTE, delete the source, or overwrite an existing target.
: "${PGDATABASE:?PGDATABASE must name the source database}"
: "${PGUSER:?PGUSER is required}"
: "${RESTORE_DATABASE:?RESTORE_DATABASE must name a pre-created empty target database}"

if [ "$PGDATABASE" = "$RESTORE_DATABASE" ]; then
  echo "Source and restore databases must be different." >&2
  exit 2
fi
case "$RESTORE_DATABASE" in
  ''|*[!A-Za-z0-9_]*) echo "RESTORE_DATABASE may contain only letters, numbers and underscores." >&2; exit 2 ;;
esac

work_dir=$(mktemp -d "${TMPDIR:-/tmp}/serveos-restore-rehearsal.XXXXXX")
case "$work_dir" in
  "${TMPDIR:-/tmp}"/serveos-restore-rehearsal.*) ;;
  *) echo "Temporary rehearsal directory is outside its expected prefix." >&2; exit 2 ;;
esac
trap 'rm -rf "$work_dir"' EXIT HUP INT TERM
dump_file="$work_dir/serveos.dump"

target_objects=$(psql --no-password --no-psqlrc --set=ON_ERROR_STOP=1 --dbname="$RESTORE_DATABASE" --tuples-only --no-align --command="SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast' AND c.relkind IN ('r','p','v','m','S','f')")
if [ "$target_objects" != "0" ]; then
  echo "The restore database is not empty; no restore was attempted." >&2
  exit 2
fi

totals_sql=$(cat <<'SQL'
SELECT jsonb_build_object(
  'orders', (SELECT jsonb_build_object('count',count(*),'grossMinor',COALESCE(sum(grand_total_minor),0),'paidMinor',COALESCE(sum(amount_paid_minor),0),'refundedMinor',COALESCE(sum(refunded_amount_minor),0)) FROM pos_orders),
  'payments', (SELECT jsonb_build_object('count',count(*),'amountMinor',COALESCE(sum(amount_minor),0)) FROM order_payments),
  'refunds', (SELECT jsonb_build_object('count',count(*),'amountMinor',COALESCE(sum(amount_minor),0)) FROM payment_refunds),
  'journals', (SELECT jsonb_build_object('count',count(*),'debitMinor',COALESCE(sum(debit_minor),0),'creditMinor',COALESCE(sum(credit_minor),0)) FROM financial_journal_lines),
  'stockBalances', (SELECT jsonb_build_object('count',count(*),'quantity',COALESCE(sum(quantity),0)) FROM inventory_location_balances),
  'stockMovements', (SELECT jsonb_build_object('count',count(*),'quantityDelta',COALESCE(sum(quantity_delta),0)) FROM inventory_movements),
  'stockConsumptions', (SELECT jsonb_build_object('count',count(*),'quantity',COALESCE(sum(quantity),0)) FROM pos_stock_consumptions),
  'stockCounts', (SELECT count(*) FROM inventory_stock_counts),
  'cashEntries', (SELECT jsonb_build_object('count',count(*),'amountDeltaMinor',COALESCE(sum(amount_delta_minor),0)) FROM till_cash_entries),
  'closedTills', (SELECT jsonb_build_object('count',count(*),'expectedMinor',COALESCE(sum(expected_cash_minor),0),'countedMinor',COALESCE(sum(counted_cash_minor),0)) FROM till_sessions WHERE status='CLOSED'),
  'closeDayReports', (SELECT count(*) FROM close_day_reports)
)::text;
SQL
)

source_totals=$(psql --no-password --no-psqlrc --set=ON_ERROR_STOP=1 --dbname="$PGDATABASE" --tuples-only --no-align --command="$totals_sql")
pg_dump --no-password --format=custom --compress=6 --file="$dump_file" --dbname="$PGDATABASE"
if [ ! -s "$dump_file" ]; then
  echo "The local database dump is empty." >&2
  exit 1
fi
pg_restore --no-password --exit-on-error --single-transaction --no-owner --no-acl --dbname="$RESTORE_DATABASE" "$dump_file"
restored_totals=$(psql --no-password --no-psqlrc --set=ON_ERROR_STOP=1 --dbname="$RESTORE_DATABASE" --tuples-only --no-align --command="$totals_sql")
if [ "$source_totals" != "$restored_totals" ]; then
  printf 'Local restore totals do not match. Source: %s\nRestored: %s\n' "$source_totals" "$restored_totals" >&2
  exit 1
fi

printf '{"event":"local_restore_rehearsal_passed","restoreDatabase":"%s","financialAndInventoryTotalsMatch":true}\n' "$RESTORE_DATABASE"
