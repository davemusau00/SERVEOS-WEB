# Quick-Win Evidence Pack: Easy-Gap Round (post PR-00)

**Branch:** `reset/vps-platform`
**Date:** 10 October 2026
**Scope:** Lowest-effort remaining gaps, prioritized as directed, each with named acceptance evidence.

---

## 1. DEV-FIX-001D: Receipt settlement regression coverage — UNIT/API VERIFIED

`apps/api/tests/pos-lifecycle.integration.test.mjs` now proves, against real PostgreSQL:

- A completed split settlement (cash + M-Pesa) issues a sales receipt whose
  snapshot carries `balanceMinor: 0`, the exact `paidMinor`, zero credit and
  room-charge, and one settlement line per recorded tender.
- A **partial payment** keeps the order `FIRED`, issues **no sales receipt**,
  and the payment acknowledgement snapshot records the true outstanding
  balance (`balanceMinor = grand − tendered`).
- Settling the remainder completes the order and issues a receipt with
  `balanceMinor: 0` and `refundedAmountMinor: 0`.
- A **zero-value sale** (fully comped fired order) issues a receipt with
  `noPaymentRequired: true`, `balanceMinor: 0`, `totalMinor: 0`, no payments.

Fixture note: the partial-payment scenario uses a STANDARD (stockless) product
so the surrounding hardcoded stock-version sequences remain untouched.

## 2. DEFECT-002 follow-up: change-feed idempotency locked in — BROWSER VERIFIED

`tests/browser/web-storage.spec.ts` adds
"change feed re-delivery of an identical record is an idempotent no-op":
- identical re-delivery does not throw and advances the cursor;
- same-version content mutation throws `Conflicting record content at the same
  version` and rolls back the page (cursor unchanged);
- version regression throws `Non-increasing record version` (cursor unchanged).

All 6 web-storage browser tests pass (desktop).

## 3. PR-01 §1.2: Command registry inventory — DOCUMENTATION VERIFIED

- `scripts/command-inventory.mjs` imports every registered API command registry
  and generates `docs/generated/command-registry.md` (operation, permission,
  alternative permissions, approval permission, offline policy, grouped by
  domain, with a total count).
- `tests/command-inventory.test.mjs` fails if any command lacks a permission
  gate or if the committed inventory drifts from the live registries.

## 4. DEV-IMPORT-002: Example first-load template — UNIT/TEMPLATE VERIFIED

- The `sellableItems` API template manifest now ships a downloadable example
  (8 rows) covering the spec's required shapes: 24-piece soda crate (TRACKED,
  24-per-package maths), single bottled beer, whisky with 45 ml shot and
  bottle pricing (SPIRIT, ml conservation), wine sold by glass, stock-only
  maize flour, stock-only cooking oil, a no-stock service, and a room-related
  service (`service_area ROOMS`).
- `importTemplates` exposes `examples`; the Import Center gained a
  "Download example template" button producing proper CSV escaping.
- `tests/import-templates.test.mjs` requires all stock_mode shapes to be
  present and re-validates the example through `validateImportCsv` — every row
  must be structurally VALID.

---

---

## 5. PR-09 (DEV-SYNC-001/002): two-terminal consistency — UNIT/API VERIFIED

New `apps/api/tests/multi-terminal.integration.test.mjs` runs four independent
identities (manager, supervisor, and two cashier terminals, each with its own
enrolled device) against one disposable PostgreSQL business:

- **R035 two-terminal sale:** both terminals fire the same stock concurrently
  from one reviewed baseline — exactly one wins, the other receives
  `VERSION_CONFLICT`, refreshes its review and completes; exactly two 0.25 kg
  servings are deducted once each (no double deduction, no lost sale).
- **R036 simultaneous price change:** two users submit `product.save` at the
  same reviewed version — one wins, one gets `VERSION_CONFLICT`; the persisted
  price equals the winner's, and an already-issued receipt keeps its
  issue-time total (historical price integrity).
- **R018/R037 payment replay:** re-executing the identical payment command
  returns its stored outcome (`deepEqual`) with exactly one `order_payments`
  row and one receipt — a lost response never duplicates money.
- **Till ownership:** a terminal cannot pay into another terminal's till
  (`TILL_OWNERSHIP_REQUIRED`); no money is recorded by the blocked attempt.
- **Duplicate external reference:** a reference committed by terminal B blocks
  terminal A's payment with `PAYMENT_REFERENCE_DUPLICATE` before any money
  moves; a distinct reference settles normally.
- **Stale terminal:** an edit submitted from a stale review returns
  `VERSION_CONFLICT` with a refresh instruction (no blind retry).
- **Till close guard:** a till cannot close while an outlet order is unsettled
  (`UNSETTLED_ORDERS`); after settlement it closes reconciled with the exact
  expected cash; per-terminal cash ledgers hold exactly their own takings and
  stock remains conserved (8.75 kg from 10 kg after five 0.25 kg servings).

Note: 403-level business blocks (till ownership) surface to operators as
`REJECTED` outcomes, 409 version/ledger blocks as `CONFLICT` — both leave the
authoritative state untouched.

## Tests executed this round

| Suite | Result |
|---|---|
| `npm run test:api` (38 tests, real PostgreSQL — incl. two-terminal suite) | 38 pass / 0 fail |
| `npm test` (35 unit tests incl. 4 new) | 35 pass / 0 fail |
| `npm run verify:fast` (lint, contracts, architecture, build) | all green |
| web-storage browser spec (desktop, 6 tests) | 6 pass / 0 fail |

## Status classifications

| Item | Status |
|---|---|
| DEV-FIX-001D settlement matrix (API level) | UNIT/API VERIFIED (browser receipt-flow scenarios belong to PR-04) |
| Change-feed idempotency | BROWSER VERIFIED |
| Command registry inventory | DOCUMENTATION VERIFIED (per-command input contracts remain future work) |
| sellableItems example template | UNIT/TEMPLATE VERIFIED (a live 100-row import remains PR-02's gate) |
| Two-terminal consistency (DEV-SYNC-001/002) | UNIT/API VERIFIED (browser two-device acceptance remains with PR-09's full gate) |