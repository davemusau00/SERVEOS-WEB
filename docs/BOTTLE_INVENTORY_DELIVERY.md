# Bottle inventory and operator corrections — delivery record

Date: 2026-10-04. Source baseline: `ef0fba1`. This is an uncommitted development candidate, not a released installer or production acceptance.

## Execution and configuration baseline (INV-01)

Terminal entrypoints are `NativeInventoryView`, `BottleCountDialog`, `BalanceCorrectionDialog`, `QuickProductDialog`, `NativeCatalogView` and `NativeProcurementView`. They use `RuntimeProvider.command` → Tauri `runtime_command`. In LEGACY_LOCAL, `store.execute_as` dispatches within the SQLite transaction, using `inventory_corrections` for counts/corrections. In SHARED_V2, the adapter first verifies compatible capabilities, saves an immutable command envelope in `native_v2_outbox`, then invokes the authenticated shared executor. The forward PostgreSQL dispatcher delegates unchanged operations to the preceding dispatcher. The Web command adapter uses the same shared executor and dependency resolver. Authority activation is a separate commissioning operation.

Local read-only discovery found `%APPDATA%/ke.servos.business/servos.sqlite` at schema 15, installation stage `INTAKE_IN_PROGRESS`, zero active stock masters and zero pending legacy outbox entries. No authority-mode metadata was present. The discovered local executable reported version 0.1.0. This incomplete local setup is not representative business data. No installed database was migrated, no staff credentials were read, and no production terminal or hosted project was changed.

`Review bottle configuration` is read-only. It displays configured capacity, scan conversion, product and recipe/modifier links, canonical balances and inferred or persisted sealed/open state. Capacity is never inferred from the name. An inferred split is presentation only until a reviewed physical count/correction persists it. Production classification and before-upgrade controls require a supported restored backup, which has not been supplied.

## Delivered contracts and safety boundaries

| Work | Candidate behavior | Remaining acceptance |
|---|---|---|
| INV-02–04 | Typed count/adjustment builders retain distinct field names. Both handlers validate integer sealed bottles, open ml below capacity, canonical totals and frozen dependencies. Manual/scanner inputs and reviewed command identity use durable SQLite drafts. | Restored operator drafts, physical scanner and shared outage pilot. |
| INV-05 | Explicit optional selling methods in catalog. Missing values preserve existing behavior. Whole-only requires a valid whole format and resolved open stock/consumption routes; physical stock displays before canonical quantities. | Representative real catalog review and POS pilot. |
| INV-06 | Reasoned, reviewed balance correction with frozen versions and optional immutable count/movement link. | Real correction-history/operator acceptance. |
| INV-07 | Separate atomic `inventory.countSelected`; explicit unique selection exactly equals rows. FULL retains all-active-item coverage. Search never changes scope. | Real stocktake coverage rehearsal. |
| INV-08 | Procurement retains package conversion and valuation boundary. Typed sealed/open transfer and waste preserve physical state and reject unsupported open transfers atomically. | Supplier invoice and physical movement reconciliation. |
| ERR-01–02 | Draft discard, guarded master restore, current corrections, and linked waste/transfer recording reversals. Later activity blocks exact reversal and directs current physical correction. Existing void/refund/payment-reversal workflows remain distinct from stock return and external payout. | End-to-end operator discovery and dependency-blocker pilot. |
| ERR-03 | Accounting state matrix and executable proposal examples in `PROCUREMENT_CORRECTION_ACCOUNTING_DESIGN.md`. | Accounting review/approval — pending. |
| ERR-04 | Exact unused duplicate receipt reversal with stock/cost, PO, payable and journal links; immutable receipt and one correction limit; retries recover the same result. Older receipts without captured baselines are blocked. | Financial acceptance. Consumed/paid/price/return corrections remain disabled. |

Additional history collections are append-only: `inventoryCorrections`, `receiptCorrections`, `procurementCorrectionBaselines`, `inventoryMovementBaselines`, and `movementCorrections`. New baselines are captured with new receipts/movements; historical baselines are not fabricated. Corrections are full safe compensations with remaining correctable amount/quantity zero; partial financial correction awaits the design gate.

Native count/correction workflows work under both authority modes. Web uses compatible typed helpers/shared handlers, but new selected-count and linked-reversal UI entrypoints are not yet present; the operation manifest records this gap.

## Upgrade, release and rollback gates

1. Preserve the existing terminal's identity, staff/PIN records, history, outbox and drafts. Take and restore a supported checkpoint on an isolated machine. Record stock totals by location, explicit/inferred sealed/open totals, valuation, orders, tills, supplier balances and pending commands before opening the candidate.
2. Native schema 16 is additive and protects correction history. Reconcile all controls after upgrade, including legacy drafts. The older schema-15 binary must refuse the newer database. Keep LEGACY_LOCAL authority when validating a local upgrade.
3. For shared authority, deploy the compatible forward migration and verify the authenticated inventory capability response before enabling new workflows. Never activate simultaneous local and shared writers.
4. Run `npm run verify:release` against the final candidate and retain its actual output. Software fixtures, browser mocks and disposable PostgreSQL are separate from installed-terminal, hosted and hardware acceptance.
5. Pilot reviewed representative items with their affected trading paused during counts. Verify whole bottle and measured sales, tills, actual Windows printing, XP-80T output and physical scanner behavior independently.
6. Disable new presentation where safely supported if a pilot fails. Do not install an older binary over a schema-16 database or restore a checkpoint over intervening sales. Written-data issues require a forward fix and reconciliation.

There is no restored-business-data rehearsal, new installer acceptance, hosted migration, accounting approval, physical-stock or hardware acceptance in this source change. Release remains gated on that evidence.

## Verification evidence

The first native run passed 103 domain tests. Expanded movement/rejection tests and the final aggregate are recorded in `BOTTLE_INVENTORY_TEST_EVIDENCE.md`. Earlier shared suites passed the forward migration and existing scenarios; fixture failures in the newly added bottle suite were corrected and rerun. A passing migration alone does not establish new-operation acceptance.
