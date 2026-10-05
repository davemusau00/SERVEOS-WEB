# 14 — Migration and Production Cutover

## 1. Goal

Move existing ServOS installations/data to the new VPS backend without reintroducing two competing writers.

## 2. Non-negotiable rule

There must never be a production period where:

```text
old cloud writer = ON
and
new API writer = ON
```

for the same business truth.

## 3. Determine the source of truth per business

Before migration, classify each installation:

### Case A — Terminal/local state authoritative

Use SQLite export as migration source.

### Case B — Current V2 cloud authoritative

Use V2/PostgreSQL export as source.

### Case C — both contain real transactions

Do not "merge automatically" by updated timestamp.

Run reconciliation and explicitly resolve differences before cutover.

## 4. Migration tool

Build a dedicated CLI/tool, not ad hoc SQL copy/paste.

Example:

```text
serveos-migrate inspect
serveos-migrate export
serveos-migrate dry-run
serveos-migrate import
serveos-migrate verify
```

Legacy readers live outside production API runtime.

## 5. Migration manifest

Export includes:

```text
source type/version
business identity
export timestamp
source terminal/project IDs
entity counts
content hashes
sequence/document counters
control totals
records/pages
unsupported/unmapped data list
```

Credential fields are excluded.

## 6. Data domains to reconcile

At minimum:

- business/settings;
- staff/roles;
- outlets/service areas;
- stock/storage locations;
- items/stock links/packages/barcodes;
- current stock by location;
- movement history if retained;
- recipes;
- suppliers;
- open/closed POs as retention policy requires;
- tills/open sessions;
- orders/payments/receipts;
- customer credit;
- rooms/types/rates;
- reservations/stays/folios;
- assets/maintenance;
- document numbering.

## 7. Control totals

The verifier compares business-level totals such as:

```text
active item count
stock quantity by item/location
stock value
open till expected cash
paid sales totals by day
M-Pesa totals
unsettled credit
supplier payable balances
active reservations/stays
open folio balances
room count/status
receipt/document max sequence
```

No cutover if unexplained differences remain.

## 8. Dry run

Migration is first executed against an isolated staging database.

Output:

- imported counts;
- rejected records;
- transformed records;
- warnings;
- control-total differences;
- unsupported legacy features.

The dry run produces no production mutation.

## 9. Cutover window

Recommended sequence:

```text
1. Announce maintenance/cutover window
2. Stop business mutations or close shift
3. Force old outbox/sync to known state where relevant
4. Take local SQLite backup
5. Take old cloud backup
6. Export final migration manifest
7. Hash/freeze source
8. Import to new PostgreSQL
9. Verify entity counts/hashes
10. Verify business control totals
11. Create/enroll production devices/users
12. Bootstrap Terminal from new API into fresh/new projection
13. Run read-only comparison
14. Fence old cloud mutation paths
15. Enable new API production mutation
16. Run smoke transaction suite
17. Reconcile first live sale/payment/stock/room operation
18. Reopen full trading
```

## 10. Terminal migration

Do not simply point the existing legacy SQLite database at the new API.

Preferred approach:

- preserve old SQLite as evidence/rollback artifact;
- build a clean new projection from API bootstrap;
- migrate terminal-only hardware preferences selectively;
- verify printer/scanner;
- retain legacy DB read-only for defined rollback period.

This ensures the new sync state begins with a clean cursor and known schema.

## 11. Old Supabase/V2

After successful cutover:

- disable/fence mutation RPCs;
- remove client credentials from active apps;
- preserve DB read-only for agreed retention/rollback window;
- export/archive required evidence;
- decommission later.

Do not maintain permanent dual synchronization.

## 12. Rollback decision point

Before new live transactions accumulate, rollback is straightforward: return clients to old release/source.

After meaningful new transactions occur on the new API, rollback must not simply reactivate the old writer because it lacks those transactions.

At that point recovery is:

- repair new platform; or
- migrate new transactions back through an explicit reverse procedure.

Define the rollback cutoff in the cutover runbook.

## 13. Cutover smoke suite

Immediately prove:

- login/session;
- item lookup;
- till open;
- sale/payment;
- receipt print;
- stock decrement;
- room quick check-in if enabled;
- Web sees Terminal change;
- Web command reaches Terminal projection;
- restart Terminal;
- command ID replay does not duplicate.

## 14. Post-cutover monitoring

For initial period watch closely:

- API errors;
- sync cursor lag;
- unknown commands;
- DB locks/slow queries;
- stock/financial control totals;
- printer queue issues;
- authentication/session failures.

## 15. Migration completion evidence

Archive:

- source backups;
- source manifest hash;
- target schema version;
- target control totals;
- migration tool version/SHA;
- verifier output;
- accepted differences with signed reason;
- cutover timestamp;
- deployed release SHA;
- first-live-transaction evidence.
